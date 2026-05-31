//== bookmarklet definitions. each entry has a stable name, a display label,
//== and a function that runs in the active tab's page context, not the popup.
//== anything written inside fn must be self-contained: no closure variables
//== from popup.js, no module imports, and no chrome.* apis. fn has access to
//== the page's dom only.

const BOOKMARKLETS = [
  {
    name: 'check-target-sizes',
    label: 'Check Target Sizes',
    description: 'Under 24x24 px or overlapping',
    fn: function (colours) {
      const OVERLAY_ATTR = 'data-target-size-overlay'

      //== remove overlays from any bookmarklet so only one tool's results show at a time.
      document
        .querySelectorAll('[data-target-size-overlay], [data-empty-heading-overlay], [data-empty-anchor-overlay]')
        .forEach(function (node) {
          node.remove()
        })

      function getCenter(el) {
        const rect = el.getBoundingClientRect()
        return {
          top: rect.top + window.scrollY + rect.height / 2,
          left: rect.left + window.scrollX + rect.width / 2
        }
      }

      function isVisible(el) {
        let current = el
        while (current) {
          const styles = getComputedStyle(current)
          if (styles.display === 'none' || styles.visibility === 'hidden') return false
          current = current.parentElement
        }
        return true
      }

      const selector =
        'a, label, button, input:not([type=hidden]), select, textarea, [tabindex], [role=button], [role=checkbox], [role=link], [role=menuitem], [role=option], [role=radio], [role=switch], [role=tab]'
      const controls = [...document.querySelectorAll(selector)].filter(isVisible)
      const tracked = []

      controls.forEach(function (el) {
        //== skip controls that are inside a label - the label itself is the target.
        if (!el.matches('label') && el.closest('label')) return

        const rect = el.getBoundingClientRect()
        tracked.push({
          element: el,
          center: getCenter(el),
          undersized: rect.width < 24 || rect.height < 24
        })
      })

      //== detect overlaps before drawing so the overlay can reflect overlap state.
      const overlapping = new Set()
      tracked.forEach(function (a, i) {
        tracked.slice(i + 1).forEach(function (b) {
          const dx = b.center.left - a.center.left
          const dy = b.center.top - a.center.top
          if (Math.sqrt(dx * dx + dy * dy) < 24) {
            overlapping.add(a)
            overlapping.add(b)
          }
        })
      })

      tracked.forEach(function (entry) {
        const isOverlap = overlapping.has(entry)
        const fillBase = entry.undersized ? colours.error : colours.success
        //== overlap shows as a warning border on top of the size pass/fail tint.
        const borderColour = isOverlap ? colours.warning : entry.undersized ? colours.error : colours.success

        const overlay = document.createElement('div')
        overlay.setAttribute(OVERLAY_ATTR, '')
        overlay.setAttribute('aria-hidden', 'true')
        overlay.style.position = 'absolute'
        overlay.style.top = `${entry.center.top - 12}px`
        overlay.style.left = `${entry.center.left - 12}px`
        overlay.style.width = '24px'
        overlay.style.height = '24px'
        overlay.style.border = `2px solid ${borderColour}`
        overlay.style.background = `color-mix(in srgb, ${fillBase} 12%, transparent)`
        overlay.style.boxSizing = 'border-box'
        overlay.style.pointerEvents = 'none'
        overlay.style.zIndex = '9999'
        document.body.appendChild(overlay)
      })

      const overlapElements = [...overlapping].map(function (entry) {
        return entry.element
      })
      if (overlapElements.length) {
        console.groupCollapsed(`Check Target Sizes: ${overlapElements.length} overlapping controls`)
        overlapElements.forEach(function (el) {
          console.log(el)
        })
        console.groupEnd()
      }

      //== total issues = controls that are undersized OR overlapping, counted once each.
      return tracked.filter(function (entry) {
        return entry.undersized || overlapping.has(entry)
      }).length
    }
  },
  {
    name: 'check-empty-headings',
    label: 'Check Empty Headings',
    description: 'Headings with no content',
    fn: function (colours) {
      const OVERLAY_ATTR = 'data-empty-heading-overlay'

      //== remove overlays from any bookmarklet so only one tool's results show at a time.
      document
        .querySelectorAll('[data-target-size-overlay], [data-empty-heading-overlay], [data-empty-anchor-overlay]')
        .forEach(function (node) {
          node.remove()
        })

      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6')
      let count = 0

      headings.forEach(function (heading) {
        if (heading.textContent.trim()) return

        const rect = heading.getBoundingClientRect()
        const tagName = heading.tagName.toLowerCase()

        const overlay = document.createElement('div')
        overlay.setAttribute(OVERLAY_ATTR, '')
        overlay.setAttribute('aria-hidden', 'true')
        overlay.style.position = 'absolute'
        overlay.style.top = `${rect.top + window.scrollY}px`
        overlay.style.left = `${rect.left + window.scrollX}px`
        overlay.style.width = `${Math.max(rect.width, 120)}px`
        overlay.style.height = `${Math.max(rect.height, 24)}px`
        overlay.style.border = `2px solid ${colours.error}`
        overlay.style.background = `color-mix(in srgb, ${colours.error} 12%, transparent)`
        overlay.style.boxSizing = 'border-box'
        overlay.style.pointerEvents = 'none'
        overlay.style.zIndex = '9999'

        //== if the heading sits near the top of the document, drawing the badge
        //== above it would clip outside y=0; flip it below the overlay instead.
        const placeBelow = rect.top + window.scrollY < 32
        const tag = document.createElement('span')
        tag.textContent = `⚠ ${tagName}`
        tag.style.cssText = `background:${colours.error};color:white;font-size:1rem;padding:4px 10px;font-family:monospace;position:absolute;${placeBelow ? 'top' : 'bottom'}:calc(100% + 2px);left:-2px`
        overlay.appendChild(tag)

        document.body.appendChild(overlay)
        count++
      })

      return count
    }
  },
  {
    name: 'check-empty-links',
    label: 'Check Empty Links',
    description: 'Links with no accessible name',
    fn: function (colours) {
      const OVERLAY_ATTR = 'data-empty-anchor-overlay'

      //== remove overlays from any bookmarklet so only one tool's results show at a time.
      document
        .querySelectorAll('[data-target-size-overlay], [data-empty-heading-overlay], [data-empty-anchor-overlay]')
        .forEach(function (node) {
          node.remove()
        })

      function isVisible(el) {
        let current = el
        while (current) {
          const styles = getComputedStyle(current)
          if (styles.display === 'none' || styles.visibility === 'hidden') return false
          current = current.parentElement
        }
        return true
      }

      function hasAccessibleName(anchor) {
        const ariaLabel = anchor.getAttribute('aria-label')
        if (ariaLabel && ariaLabel.trim()) return true

        const labelledBy = anchor.getAttribute('aria-labelledby')
        if (labelledBy) {
          const ids = labelledBy.split(/\s+/).filter(Boolean)
          for (const id of ids) {
            const ref = document.getElementById(id)
            if (ref && ref.textContent.trim()) return true
          }
        }

        if (anchor.textContent.trim()) return true

        const images = anchor.querySelectorAll('img')
        for (const img of images) {
          const alt = img.getAttribute('alt')
          if (alt && alt.trim()) return true
        }

        return false
      }

      const anchors = [...document.querySelectorAll('a[href]')].filter(isVisible)
      let count = 0

      anchors.forEach(function (anchor) {
        if (hasAccessibleName(anchor)) return

        const rect = anchor.getBoundingClientRect()

        const overlay = document.createElement('div')
        overlay.setAttribute(OVERLAY_ATTR, '')
        overlay.setAttribute('aria-hidden', 'true')
        overlay.style.position = 'absolute'
        overlay.style.top = `${rect.top + window.scrollY}px`
        overlay.style.left = `${rect.left + window.scrollX}px`
        overlay.style.width = `${Math.max(rect.width, 120)}px`
        overlay.style.height = `${Math.max(rect.height, 24)}px`
        overlay.style.border = `2px solid ${colours.error}`
        overlay.style.background = `color-mix(in srgb, ${colours.error} 12%, transparent)`
        overlay.style.boxSizing = 'border-box'
        overlay.style.pointerEvents = 'none'
        overlay.style.zIndex = '9999'

        //== if the link sits near the top of the document, drawing the badge
        //== above it would clip outside y=0; flip it below the overlay instead.
        const placeBelow = rect.top + window.scrollY < 32
        const tag = document.createElement('span')
        tag.textContent = '⚠ Link'
        tag.style.cssText = `background:${colours.error};color:white;font-size:1rem;padding:5px 10px;font-family:monospace;position:absolute;${placeBelow ? 'top' : 'bottom'}:calc(100% + 2px);left:-2px`
        overlay.appendChild(tag)

        document.body.appendChild(overlay)
        count++
      })

      return count
    }
  }
]
