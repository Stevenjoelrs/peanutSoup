export function normalizarEstado(estadoBackend) {
    if (!estadoBackend) return "Solicitado";
    const est = String(estadoBackend).toLowerCase();

    if (est.includes('curs')) return "En Curso";
    if (est.includes('acept')) return "Aceptado";
    if (est.includes('termin') || est.includes('complet')) return "Terminado";
    return "Solicitado";
}

export function renderizarTabla(ordenes, onDescargarClick) {
    const tbody = document.getElementById("tablaOrdenesBody");
    tbody.replaceChildren();

    if (!ordenes || ordenes.length === 0) {
        const fila = document.createElement('tr');
        const celda = document.createElement('td');
        celda.colSpan = 6;
        celda.className = 'empty-state';
        celda.textContent = 'No se encontraron órdenes registradas.';
        fila.append(celda);
        tbody.append(fila);
        return;
    }

    ordenes.forEach((orden) => {
        const estadoReal = normalizarEstado(orden.estado);
        const tr = document.createElement("tr");

        const celdaId = document.createElement('td');
        const numeroOrden = document.createElement('strong');
        const anioOrden = String(orden.fecha_orden ?? '').slice(0, 4);
        const sufijoOrden = String(orden.id_orden ?? '').replace(/-/g, '').slice(0, 6).toUpperCase();
        numeroOrden.textContent = anioOrden && sufijoOrden ? `LAB-${anioOrden}-${sufijoOrden}` : '—';
        celdaId.append(numeroOrden);

        const celdaAnalisis = document.createElement('td');
        celdaAnalisis.textContent = orden.analisis_solicitados || 'Examen general de laboratorio';

        const celdaMedico = document.createElement('td');
        celdaMedico.textContent = orden.medico_solicitante || 'No especificado';

        const celdaFecha = document.createElement('td');
        celdaFecha.textContent = orden.fecha_orden
            ? new Date(orden.fecha_orden).toLocaleDateString('es-BO')
            : 'S/F';

        const celdaEstado = document.createElement('td');
        const badge = document.createElement('span');
        const claseEstado = {
            Solicitado: 'pending',
            'En Curso': 'warning',
            Aceptado: 'accepted',
            Terminado: 'success'
        }[estadoReal] ?? 'pending';
        badge.className = `badge-status ${claseEstado}`;
        badge.textContent = estadoReal;
        celdaEstado.append(badge);

        const celdaAccion = document.createElement('td');
        if (estadoReal === 'Terminado' && orden.id_orden != null) {
            const boton = document.createElement('button');
            boton.type = 'button';
            boton.className = 'btn-sm btn-primary btn-download';
            boton.textContent = 'Descargar informe';
            boton.addEventListener('click', () => onDescargarClick(orden));
            celdaAccion.append(boton);
        } else {
            const nota = document.createElement('span');
            nota.className = 'action-hint';
            nota.textContent = 'No disponible';
            celdaAccion.append(nota);
        }

        tr.append(celdaId, celdaAnalisis, celdaMedico, celdaFecha, celdaEstado, celdaAccion);
        tbody.appendChild(tr);
    });
}

export function mostrarAlerta(mensaje) {
    const alertaError = document.getElementById("alertaError");
    if (alertaError) {
        alertaError.hidden = false;
        alertaError.textContent = mensaje;
    }
}