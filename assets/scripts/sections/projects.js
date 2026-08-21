import Filterizr from 'filterizr'

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
})
