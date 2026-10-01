document.addEventListener("DOMContentLoaded", async () => {
    try {
        // 1. Consultar la vigencia actual al backend (US-12)
        const respuesta = await fetch('/api/afiliaciones/vigencia');
        const data = await respuesta.json(); 

        // 2. Pintar los datos reales en la pantalla
        document.getElementById('fecha-vencimiento').textContent = data.fechaVencimientoText;
        document.getElementById('dias-restantes').textContent = `${data.diasRestantes} Días`;

        const botonRenovar = document.getElementById('btn-renovar');

        // 3. REGLA DE LA US-12: Habilitar ÚNICAMENTE si restan 30 días o menos
        if (data.diasRestantes <= 30) {
            botonRenovar.disabled = false;
            botonRenovar.style.cursor = 'pointer';
            botonRenovar.style.opacity = '1';
        } else {
            botonRenovar.disabled = true;
            botonRenovar.style.cursor = 'not-allowed';
            botonRenovar.style.opacity = '0.6';
        }

    } catch (error) {
        console.error("Error al obtener la vigencia de la afiliación:", error);
    }
});

// 4. Acción al hacer clic en el botón de Renovar (POST)
const botonRenovar = document.getElementById('btn-renovar');
if (botonRenovar) {
    botonRenovar.addEventListener('click', async () => {
        if (botonRenovar.disabled) return;

        try {
            botonRenovar.textContent = "Procesando...";
            
            const res = await fetch('/api/afiliaciones/renovar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ matricula: "202104829" })
            });

            const resultado = await res.json();

            if (res.ok) {
                alert("¡Trámite de renovación realizado con éxito! Cobertura activa.");
                location.reload();
            } else {
                alert("No se pudo procesar: " + (resultado.mensaje || "Error desconocido"));
                botonRenovar.disabled = false;
            }
        } catch (e) {
            console.error("Error en la petición POST de renovación", e);
            botonRenovar.disabled = false;
        }
    });
}