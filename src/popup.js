document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('buttons-container')
  const statusEl = document.getElementById('extension-status')
  const buttonsByName = {}

  for (const [shortcutIndex, bookmarklet] of BOOKMARKLETS.entries()) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.name = bookmarklet.name
    button.setAttribute('aria-keyshortcuts', String(shortcutIndex + 1))

    const labelGroup = document.createElement('span')
    labelGroup.className = 'btn-label-group'

    const label = document.createElement('span')
    label.className = 'btn-label'
    label.textContent = bookmarklet.label

    const desc = document.createElement('span')
    desc.className = 'btn-desc'
    desc.textContent = bookmarklet.description

    labelGroup.append(label, desc)

    const count = document.createElement('span')
    count.className = 'btn-count'
    count.hidden = true

    button.append(labelGroup, count)
    button.addEventListener('click', () => {
      //== mark the clicked button as the currently active tool; only one at a time.
      container.querySelectorAll('button.is-active').forEach(function (other) {
        other.classList.remove('is-active')
      })
      button.classList.add('is-active')
      run(bookmarklet, count, statusEl)
    })
    container.appendChild(button)
    buttonsByName[bookmarklet.name] = button
  }

  const clearButton = document.getElementById('clear-button')
  clearButton.setAttribute('aria-keyshortcuts', 'Escape')
  clearButton.addEventListener('click', () => clearAll(container, statusEl))

  //== keyboard shortcuts: digits 1-9 fire the nth tool button, Escape clears.
  document.addEventListener('keydown', function (event) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    if (event.key === 'Escape') {
      event.preventDefault()
      clearButton.click()
      return
    }
    if (/^[1-9]$/.test(event.key)) {
      const index = parseInt(event.key, 10) - 1
      const toolButton = container.querySelectorAll('button')[index]
      if (toolButton) {
        event.preventDefault()
        toolButton.click()
      }
    }
  })

  await restoreState(buttonsByName)
})

async function clearAll(container, statusEl) {
  //== reset popup state immediately; the page-side cleanup is best-effort.
  statusEl.textContent = ''
  statusEl.hidden = true

  container.querySelectorAll('button').forEach(function (button) {
    button.classList.remove('is-active')
    const countEl = button.querySelector('.btn-count')
    if (countEl) {
      countEl.textContent = ''
      countEl.hidden = true
      countEl.classList.remove('is-zero')
    }
  })

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return

    await chrome.storage.session.remove(`tab_${tab.id}`)

    //== wipe any overlays still on the page. silent on restricted pages where there
    //== were no overlays to begin with (a bookmarklet couldn't have run there).
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function () {
        document
          .querySelectorAll(
            '[data-target-size-overlay], [data-empty-heading-overlay], [data-empty-anchor-overlay], [data-duplicate-id-overlay]'
          )
          .forEach(function (node) {
            node.remove()
          })
      }
    })
  } catch {
    //== popup state was already cleared; nothing more to do.
  }
}

async function run(bookmarklet, countEl, statusEl) {
  //== clear previous count and status before the run, so a failed run does not show stale data.
  countEl.textContent = ''
  countEl.hidden = true
  statusEl.textContent = ''
  statusEl.hidden = true

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return

    //== read the popup's semantic colour tokens and forward them via args.
    //== fn runs in the page's isolated world and cannot read popup css variables.
    const styles = getComputedStyle(document.documentElement)
    const colours = {
      success: styles.getPropertyValue('--colour-success-base').trim(),
      warning: styles.getPropertyValue('--colour-warning-base').trim(),
      error: styles.getPropertyValue('--colour-error-base').trim(),
      info: styles.getPropertyValue('--colour-info-base').trim()
    }

    //== install the shared console reporter (window.__a11yOutliner) before the check
    //== fn runs. it lives in the page's isolated world, which persists across these
    //== executeScript calls, so every bookmarklet can share the one logFindings.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: installOutlinerHelpers
    })

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: bookmarklet.fn,
      args: [colours]
    })

    const num = results?.[0]?.result
    if (typeof num === 'number') {
      countEl.textContent = num
      countEl.classList.toggle('is-zero', num === 0)
      countEl.hidden = false
      await saveState(tab, bookmarklet.name, num)
    }
  } catch {
    //== chrome blocks scripting on chrome://, the web store, and other extension pages.
    statusEl.textContent = "This page can't be scripted by extensions."
    statusEl.hidden = false
  }
}

async function restoreState(buttonsByName) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return

    const key = `tab_${tab.id}`
    const stored = (await chrome.storage.session.get(key))[key]
    if (!stored) return

    //== cache is only valid while the document is the same one where it was recorded.
    //== url mismatch means navigation; timeOrigin mismatch means a reload of the same url.
    //== in either case the overlays are gone and the cached counts are stale.
    const currentTimeOrigin = await getPageTimeOrigin(tab.id)
    if (stored.url !== tab.url || stored.timeOrigin !== currentTimeOrigin) {
      await chrome.storage.session.remove(key)
      return
    }

    if (stored.counts) {
      for (const [name, num] of Object.entries(stored.counts)) {
        const button = buttonsByName[name]
        if (!button || typeof num !== 'number') continue
        const countEl = button.querySelector('.btn-count')
        if (!countEl) continue
        countEl.textContent = num
        countEl.classList.toggle('is-zero', num === 0)
        countEl.hidden = false
      }
    }

    if (stored.activeTool && buttonsByName[stored.activeTool]) {
      buttonsByName[stored.activeTool].classList.add('is-active')
    }
  } catch {
    //== fail silently; the popup just shows fresh state.
  }
}

async function saveState(tab, toolName, count) {
  try {
    const key = `tab_${tab.id}`
    const timeOrigin = await getPageTimeOrigin(tab.id)
    const existing = (await chrome.storage.session.get(key))[key]
    //== carry over other tools' counts only if the page is the same document.
    //== url change = navigation; timeOrigin change = reload of the same url.
    const sameDocument = existing && existing.url === tab.url && existing.timeOrigin === timeOrigin
    const carryOver = sameDocument ? existing.counts : {}
    await chrome.storage.session.set({
      [key]: {
        url: tab.url,
        timeOrigin,
        activeTool: toolName,
        counts: { ...carryOver, [toolName]: count }
      }
    })
  } catch {
    //== ignore; storage failures shouldn't break the popup.
  }
}

async function getPageTimeOrigin(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: function () {
        return performance.timeOrigin
      }
    })
    return results?.[0]?.result ?? null
  } catch {
    //== restricted pages (chrome://, web store) cannot be scripted.
    return null
  }
}
