(() => {
  'use strict'

  const dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack
  const respectsDNT = dnt === '1' || dnt === 'yes'

  const sendEvent = (eventName, parameters) => {
    if (respectsDNT || window.doNotTrack === true || !Array.isArray(window.dataLayer)) {
      return
    }

    if (typeof window.gtag !== 'function') {
      window.gtag = function () {
        window.dataLayer.push(arguments)
      }
    }

    window.gtag('event', eventName, parameters)
  }

  const getCurrentLanguage = () => {
    return (document.documentElement.lang || 'en').split('-')[0].toLowerCase()
  }

  const getLinkLocation = (link) => {
    const section = link.closest('section[id], main[id], footer')
    if (!section) return 'page'
    if (section.tagName.toLowerCase() === 'footer') return 'footer'
    return section.id || section.tagName.toLowerCase()
  }

  const getTargetLanguage = (url) => {
    return /^\/es(?:\/|$)/.test(url.pathname) ? 'es' : 'en'
  }

  document.addEventListener('click', (clickEvent) => {
    const link = clickEvent.target.closest('a[href]')
    if (!link) return

    let url
    try {
      url = new URL(link.href, window.location.href)
    } catch (_) {
      return
    }

    const linkText = (link.textContent || link.title || '').trim().replace(/\s+/g, ' ')
    const commonParameters = {
      link_url: url.href,
      link_text: linkText,
      link_location: getLinkLocation(link),
      page_language: getCurrentLanguage()
    }

    if (url.pathname.toLowerCase().endsWith('.pdf')) {
      sendEvent('resume_download', {
        ...commonParameters,
        file_name: url.pathname.split('/').pop()
      })
    }

    if (url.protocol === 'mailto:') {
      sendEvent('contact_click', {
        ...commonParameters,
        contact_method: 'email'
      })
    }

    if (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')) {
      sendEvent('linkedin_click', commonParameters)
    }

    if (url.hostname === 'github.com' || url.hostname.endsWith('.github.com')) {
      sendEvent('github_click', commonParameters)
    }

    const projectCard = link.closest('#projects .filtr-item')
    if (projectCard && /^https?:$/.test(url.protocol)) {
      const projectTitle = projectCard.querySelector('.card-title')
      sendEvent('project_open', {
        ...commonParameters,
        project_name: projectTitle ? projectTitle.textContent.trim() : linkText,
        project_url: url.href
      })
    }

    if (link.classList.contains('languages-item')) {
      sendEvent('language_change', {
        ...commonParameters,
        from_language: getCurrentLanguage(),
        to_language: getTargetLanguage(url)
      })
    }
  }, { capture: true })
})()
