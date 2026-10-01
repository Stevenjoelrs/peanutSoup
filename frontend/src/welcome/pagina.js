/**
 * PORTADA — página pública, no requiere sesión (no usa armazón ni JWT).
 * Solo hidrata los iconos Lucide (CDN) una vez listo el DOM.
 */
export const iniciarPagina = () => {
  const hidratarIconos = () => {
    if (window.lucide?.createIcons) window.lucide.createIcons();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hidratarIconos, { once: true });
  } else {
    hidratarIconos();
  }
};
