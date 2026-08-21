import Filterizr from 'filterizr'

const STAR_CACHE_TTL = 24 * 60 * 60 * 1000

function getRepositorySlug(repoUrl) {
  try {
    const url = new URL(repoUrl)
    if (url.hostname !== 'github.com') return null
    return url.pathname.replace(/^\/+|\/+$/g, '').split('/').slice(0, 2).join('/')
  } catch (_error) {
    return null
  }
}

function getCachedStars(repo) {
  try {
    const cached = JSON.parse(localStorage.getItem(`github-stars:${repo}`))
    if (cached && Date.now() - cached.timestamp < STAR_CACHE_TTL) return cached.count
  } catch (_error) {
    // Ignore unavailable or malformed browser storage.
  }
  return null
}

function cacheStars(repo, count) {
  try {
    localStorage.setItem(`github-stars:${repo}`, JSON.stringify({ count, timestamp: Date.now() }))
  } catch (_error) {
    // The button remains functional even when browser storage is unavailable.
  }
}

async function fetchStars(repo) {
  const cached = getCachedStars(repo)
  if (cached !== null) return cached

  const response = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: { Accept: 'application/vnd.github+json' }
  })
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}`)

  const repository = await response.json()
  const count = Number(repository.stargazers_count)
  if (!Number.isFinite(count)) throw new Error('Invalid GitHub star count')
  cacheStars(repo, count)
  return count
}

function hydrateStarButtons() {
  const buttonsByRepository = new Map()

  document.querySelectorAll('.project-star-button[data-github-repo]').forEach((button) => {
    const repo = getRepositorySlug(button.dataset.githubRepo)
    if (!repo) return
    if (!buttonsByRepository.has(repo)) buttonsByRepository.set(repo, [])
    buttonsByRepository.get(repo).push(button)
  })

  buttonsByRepository.forEach((buttons, repo) => {
    fetchStars(repo)
      .then((count) => {
        buttons.forEach((button) => {
          const counter = button.querySelector('[data-star-count]')
          if (counter) counter.textContent = count.toLocaleString()
        })
      })
      .catch(() => {
        buttons.forEach((button) => {
          const counter = button.querySelector('[data-star-count]')
          if (counter) counter.hidden = true
        })
      })
  })
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.filtr-projects').forEach((container) => {
    const sectionId = container.getAttribute('data-section')
    const cardHolder = document.getElementById(`project-card-holder-${sectionId}`)
    if (cardHolder != null && cardHolder.children.length !== 0) {
      const controlsSelector = `.project-filtr-control[data-section="${sectionId}"]`
      // eslint-disable-next-line no-new
      new Filterizr(container, {
        layout: 'sameWidth',
        controlsSelector
      })
    }
  })

  hydrateStarButtons()
})
