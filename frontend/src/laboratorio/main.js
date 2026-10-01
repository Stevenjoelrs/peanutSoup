import { obtenerOrdenesApi, descargarInformeApi } from './api.js';
import { renderizarTabla, mostrarAlerta } from './pagina.js';
import { exigirSesion, sesion } from '../shared/sesion.js';

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarLaboratorio, { once: true });
} else {
    inicializarLaboratorio();
}

async function inicializarLaboratorio() {
    if (!exigirSesion()) return;

    const modalInforme = document.getElementById('modal-informe');
    document.getElementById('btn-cerrar-informe')?.addEventListener('click', () => modalInforme?.close());
    modalInforme?.addEventListener('click', (evento) => {
        if (evento.target === modalInforme) modalInforme.close();
    });

    const usuario = sesion.usuario;
    const nombre = document.getElementById('lab-user-name');
    const meta = document.getElementById('lab-user-meta');
    if (nombre) nombre.textContent = usuario?.nombre_completo ?? 'Estudiante';
    if (meta) {
        meta.textContent = [usuario?.sis ? `SIS: ${usuario.sis}` : null, usuario?.facultad]
            .filter(Boolean)
            .join(' · ') || 'Sesión activa';
    }

    try {
        const ordenes = await obtenerOrdenesApi();
        const alerta = document.getElementById('alertaError');
        if (alerta) alerta.hidden = true;
        renderizarTabla(ordenes, manejarDescarga);
    } catch (error) {
        mostrarAlerta(error.message || 'No fue posible cargar tus órdenes de laboratorio.');
        renderizarTabla([], manejarDescarga);
    }
}

async function manejarDescarga(orden) {
    const modal = document.getElementById('modal-informe');
    const enlaceInforme = document.getElementById('btn-abrir-informe');
    const estadoArchivo = document.getElementById('modal-informe-estado-archivo');
    const anioOrden = String(orden.fecha_orden ?? '').slice(0, 4);
    const sufijoOrden = String(orden.id_orden ?? '').replace(/-/g, '').slice(0, 6).toUpperCase();

    document.getElementById('modal-informe-codigo').textContent = `LAB-${anioOrden}-${sufijoOrden}`;
    document.getElementById('modal-informe-analisis').textContent = orden.analisis_solicitados || 'Examen general de laboratorio';
    document.getElementById('modal-informe-medico').textContent = orden.medico_solicitante || 'No especificado';
    document.getElementById('modal-informe-fecha').textContent = orden.fecha_orden
        ? new Date(orden.fecha_orden).toLocaleDateString('es-BO')
        : 'No especificada';
    document.getElementById('modal-informe-estado').textContent = orden.estado;
    document.getElementById('modal-informe-descripcion').textContent = 'Revisa los datos de la orden y el estado del archivo.';
    document.getElementById('modal-informe-titulo').textContent = 'Detalle del informe';
    enlaceInforme.removeAttribute('href');
    enlaceInforme.classList.add('is-disabled');
    enlaceInforme.setAttribute('aria-disabled', 'true');
    enlaceInforme.setAttribute('tabindex', '-1');
    estadoArchivo.className = 'report-status is-checking';
    estadoArchivo.querySelector('.material-symbols-outlined').textContent = 'hourglass_top';
    estadoArchivo.lastChild.textContent = ' Verificando disponibilidad del informe…';
    modal.showModal();

    try {
        const datosInforme = await descargarInformeApi(orden.id_orden);
        const urlInforme = new URL(datosInforme.enlaceInforme);
        if (!['http:', 'https:'].includes(urlInforme.protocol)) {
            throw new Error('El enlace del informe no es válido.');
        }

        document.getElementById('modal-informe-codigo').textContent = datosInforme.codigo || `LAB-${anioOrden}-${sufijoOrden}`;
        document.getElementById('modal-informe-medico').textContent = datosInforme.medicoSolicitante || orden.medico_solicitante || 'No especificado';
        enlaceInforme.href = urlInforme.href;
        enlaceInforme.classList.remove('is-disabled');
        enlaceInforme.removeAttribute('aria-disabled');
        enlaceInforme.removeAttribute('tabindex');
        document.getElementById('modal-informe-titulo').textContent = 'Informe disponible';
        estadoArchivo.className = 'report-status is-available';
        estadoArchivo.querySelector('.material-symbols-outlined').textContent = 'check_circle';
        estadoArchivo.lastChild.textContent = ' El enlace del informe está disponible.';
    } catch (error) {
        document.getElementById('modal-informe-titulo').textContent = 'Informe no disponible';
        estadoArchivo.className = 'report-status is-unavailable';
        estadoArchivo.querySelector('.material-symbols-outlined').textContent = 'error';
        estadoArchivo.lastChild.textContent = ` ${error.message || 'El informe aún no está disponible.'}`;
    }
}