/**
 * SSU - UMSS | Portada del sistema
 * -----------------------------------------------------------------------------
 * Única responsabilidad: preguntar a la API si está viva y pintar el resultado.
 * Sirve como verificación de que el contenedor, el proxy y la conexión a
 * Supabase están bien montados de un vistazo al abrir el navegador.
 *
 * Cualquier otra función del portal va en su propia carpeta bajo
 * `frontend/src/<dominio>/` y se registra en `vite.config.js` (entradas) y en
 * `backend/src/shared/modules.js` (ruta limpia).
 */

const obtenerElementos = () => ({
  punto: document.getElementById('indicador'),
  texto: document.getElementById('estado-texto'),
  detalle: document.getElementById('estado-detalle')
});

const pintar = (arriba, titulo, detalle) => {
  const { punto, texto, detalle: elDetalle } = obtenerElementos();
  if (punto) {
    punto.classList.toggle('arriba', arriba);
    punto.classList.toggle('abajo', !arriba);
  }
  if (texto) texto.textContent = titulo;
  if (elDetalle) elDetalle.textContent = detalle;
};

const consultarSalud = async () => {
  try {
    const respuesta = await fetch('/api/system/health');
    const cuerpo = await respuesta.json();

    if (!respuesta.ok || cuerpo.status !== 'UP') {
      return pintar(
        false,
        'API levantada, base de datos no disponible',
        cuerpo.database?.error || 'Sin detalle: revisar DATABASE_URL en tu .env.'
      );
    }

    const latencia = cuerpo.database?.durationMs;
    return pintar(
      true,
      'API y base de datos operativas',
      `Supabase respondió en ${latencia ?? '?'} ms · entorno ${cuerpo.environment}`
    );
  } catch (error) {
    pintar(false, 'No se pudo contactar la API', String(error));
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', consultarSalud);
} else {
  consultarSalud();
}
