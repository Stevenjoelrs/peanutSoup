-- =============================================================================
-- PROYECTO: Sistema Web para el Seguro Social Universitario (SSU - UMSS)
-- MIGRACIÓN: 004_periodos_semestrales.sql
-- DESCRIPCIÓN: Catálogo de periodos semestrales para validación y cálculo de renovaciones
-- MOTOR: PostgreSQL 16/17 (compatible con Supabase Cloud)
-- -----------------------------------------------------------------------------
-- Tabla de referencia que define los periodos semestrales válidos.
-- Permite al frontend listar periodos disponibles y al backend validar/calcular renovaciones.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABLA: periodos_semestrales
-- -----------------------------------------------------------------------------
-- codigo: formato corto PYYYYS (ej. P20241 = 2024 semestre 1, P20242 = 2024 semestre 2)
-- nombre: legible para UI (ej. "2024-I", "2024-II")
-- fecha_inicio / fecha_fin: rango oficial del periodo
-- activo: si está disponible para nuevas afiliaciones/renovaciones
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS periodos_semestrales (
    codigo VARCHAR(10) PRIMARY KEY,
    nombre VARCHAR(20) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_periodo_codigo_formato CHECK (codigo ~ '^P[0-9]{4}[12]$'),
    CONSTRAINT chk_periodo_fechas CHECK (fecha_fin > fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_periodos_activo ON periodos_semestrales(activo);
CREATE INDEX IF NOT EXISTS idx_periodos_fecha ON periodos_semestrales(fecha_inicio, fecha_fin);

-- -----------------------------------------------------------------------------
-- DATOS INICIALES: Periodos 2023-2026 (se pueden ir agregando cada año)
-- -----------------------------------------------------------------------------
INSERT INTO periodos_semestrales (codigo, nombre, fecha_inicio, fecha_fin, activo) VALUES
('P20231', '2023-I', '2023-01-15', '2023-07-15', false),
('P20232', '2023-II', '2023-07-16', '2024-01-14', false),
('P20241', '2024-I', '2024-01-15', '2024-07-15', false),
('P20242', '2024-II', '2024-07-16', '2025-01-14', false),
('P20251', '2025-I', '2025-01-15', '2025-07-15', false),
('P20252', '2025-II', '2025-07-16', '2026-01-14', true),
('P20261', '2026-I', '2026-01-15', '2026-07-15', true),
('P20262', '2026-II', '2026-07-16', '2027-01-14', true)
ON CONFLICT (codigo) DO NOTHING;

-- -----------------------------------------------------------------------------
-- FUNCIÓN: obtener_siguiente_periodo(codigo_actual)
-- Devuelve el código del periodo siguiente al actual.
-- Útil para el frontend al sugerir el periodo de renovación.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION obtener_siguiente_periodo(p_codigo_actual VARCHAR(10))
RETURNS VARCHAR(10) AS $$
DECLARE
    v_anio INT;
    v_semestre INT;
    v_siguiente VARCHAR(10);
BEGIN
    -- Validar formato
    IF p_codigo_actual !~ '^P[0-9]{4}[12]$' THEN
        RAISE EXCEPTION 'Formato de periodo inválido: %', p_codigo_actual;
    END IF;

    v_anio := substring(p_codigo_actual from 'P([0-9]{4})[12]')::INT;
    v_semestre := substring(p_codigo_actual from 'P[0-9]{4}([12])')::INT;

    IF v_semestre = 1 THEN
        v_siguiente := format('P%s2', v_anio);
    ELSE
        v_siguiente := format('P%s1', v_anio + 1);
    END IF;

    -- Verificar que el periodo siguiente existe en el catálogo
    IF NOT EXISTS (SELECT 1 FROM periodos_semestrales WHERE codigo = v_siguiente) THEN
        RAISE EXCEPTION 'No existe periodo siguiente en catálogo: %', v_siguiente;
    END IF;

    RETURN v_siguiente;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- FUNCIÓN: obtener_periodo_vigente()
-- Devuelve el periodo activo que contiene la fecha actual (CURRENT_DATE).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION obtener_periodo_vigente()
RETURNS VARCHAR(10) AS $$
DECLARE
    v_codigo VARCHAR(10);
BEGIN
    SELECT codigo INTO v_codigo
    FROM periodos_semestrales
    WHERE activo
      AND fecha_inicio <= CURRENT_DATE
      AND fecha_fin >= CURRENT_DATE
    ORDER BY fecha_inicio DESC
    LIMIT 1;

    IF v_codigo IS NULL THEN
        RAISE EXCEPTION 'No hay periodo activo vigente para la fecha actual';
    END IF;

    RETURN v_codigo;
END;
$$ LANGUAGE plpgsql;