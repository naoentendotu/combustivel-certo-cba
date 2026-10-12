/**
 * Combustível Certo · Componente da Barra de Navegação Inferior
 */
const Navigation = (() => {
  let activeTab = 'map'; // O MAPA É A PÁGINA INICIAL POR PADRÃO!
  let onViewChangeCallback = null;

  function init({ defaultTab = 'map', onViewChange } = {}) {
    activeTab = defaultTab;
    onViewChangeCallback = onViewChange;

    const navButtons = document.querySelectorAll('.nav-tab-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.navTab;
        if (tab) {
          switchTab(tab);
        }
      });
    });

    // Aplica a aba inicial
    switchTab(activeTab);
  }

  function switchTab(tab) {
    activeTab = tab;

    // Atualiza botões
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      const isCurrent = btn.dataset.navTab === tab;
      btn.classList.toggle('is-active', isCurrent);
    });

    // Notifica coordenador
    if (typeof onViewChangeCallback === 'function') {
      onViewChangeCallback(tab);
    }
  }

  return {
    init,
    switchTab,
    getCurrentTab: () => activeTab
  };
})();
