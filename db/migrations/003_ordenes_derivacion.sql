-- =============================================================================
-- PROYECTO: Sistema Web para el Seguro Social Universitario (SSU - UMSS)
-- MIGRACIÓN: 003_ordenes_derivacion.sql
-- DESCRIPCIÓN: Órdenes de derivación a consulta de especialidad
-- MOTOR: PostgreSQL 16/17 (compatible con Supabase Cloud)
-- -----------------------------------------------------------------------------
-- La derivación es el requisito de entrada a la especialidad: un médico de
-- medicina general emite una orden que abre la puerta a un especialista. Por eso
-- guarda la especialidad requerida y el médico emisor, y no solo el estudiante.
--
-- estado: 'ACTIVA' | 'UTILIZADA'. Se marca UTILIZADA en la misma transacción que
-- crea la ficha, para que una orden no sirva dos veces.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ordenes_derivacion (
    id_derivacion UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_estudiante UUID NOT NULL REFERENCES estudiantes(id_estudiante) ON DELETE CASCADE,
    id_medico_emisor UUID NOT NULL REFERENCES medicos(id_medico),
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA'
        CONSTRAINT ordenes_derivacion_estado_check CHECK (estado IN ('ACTIVA', 'UTILIZADA')),
    fecha_emision TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    id_especialidad_requerida UUID REFERENCES especialidades(id_especialidad)
);

CREATE INDEX IF NOT EXISTS idx_derivaciones_estudiante_estado ON ordenes_derivacion(id_estudiante, estado);
CREATE INDEX IF NOT EXISTS idx_derivaciones_especialidad ON ordenes_derivacion(id_especialidad_requerida);
