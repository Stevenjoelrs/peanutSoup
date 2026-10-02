-- =============================================================================
-- PROYECTO: Sistema Web para el Seguro Social Universitario (SSU - UMSS)
-- MIGRACIÓN: 004_ordenes_laboratorio.sql
-- DESCRIPCIÓN: Órdenes de laboratorio y resultados
-- MOTOR: PostgreSQL 16/17 (compatible con Supabase Cloud)
-- -----------------------------------------------------------------------------
-- Una orden de laboratorio nace como consecuencia de una derivación/indicación
-- médica. El estudiante la consulta y, cuando el laboratorio termina el
-- procesamiento, se sube el resultado (PDF/archivo) vinculado 1:1 a la orden.
-- -----------------------------------------------------------------------------
-- Estados de la orden: 'EMITIDA' | 'EN_CURSO' | 'FINALIZADA'
--   EMITIDA:     el médico generó la orden para el estudiante.
--   EN_CURSO:    el laboratorio/técnico comenzó a procesarla.
--   FINALIZADA:  el laboratorio terminó y existen resultados disponibles.
-- Los cambios de estado NO forman parte de este sprint; se modifican directo en BD.
-- =============================================================================

-- Extensiones (idempotentes)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. TABLA: ordenes_laboratorio
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ordenes_laboratorio (
    id_orden_laboratorio UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_estudiante UUID NOT NULL REFERENCES estudiantes(id_estudiante) ON DELETE CASCADE,
    id_medico_emisor UUID NOT NULL REFERENCES medicos(id_medico),
    id_especialidad UUID REFERENCES especialidades(id_especialidad),
    estado VARCHAR(20) NOT NULL DEFAULT 'EMITIDA'
        CONSTRAINT ordenes_laboratorio_estado_check CHECK (estado IN ('EMITIDA', 'EN_CURSO', 'FINALIZADA')),
    fecha_emision TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    observaciones_medico TEXT
);

CREATE INDEX IF NOT EXISTS idx_ordenes_lab_estudiante_estado ON ordenes_laboratorio(id_estudiante, estado);
CREATE INDEX IF NOT EXISTS idx_ordenes_lab_medico ON ordenes_laboratorio(id_medico_emisor);
CREATE INDEX IF NOT EXISTS idx_ordenes_lab_especialidad ON ordenes_laboratorio(id_especialidad);

-- -----------------------------------------------------------------------------
-- 2. TABLA: resultados_laboratorio
-- -----------------------------------------------------------------------------
-- 1:1 con ordenes_laboratorio. El archivo se guarda en Supabase Storage u otro
-- proveedor y aquí solo se referencia la URL pública/firmada.
CREATE TABLE IF NOT EXISTS resultados_laboratorio (
    id_resultado UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_orden_laboratorio UUID NOT NULL REFERENCES ordenes_laboratorio(id_orden_laboratorio) ON DELETE CASCADE,
    archivo_url TEXT NOT NULL,
    nombre_archivo VARCHAR(255) NOT NULL,
    fecha_subida TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    subido_por UUID REFERENCES medicos(id_medico),
    CONSTRAINT uq_resultado_orden UNIQUE (id_orden_laboratorio)
);

CREATE INDEX IF NOT EXISTS idx_resultados_lab_orden ON resultados_laboratorio(id_orden_laboratorio);

-- -----------------------------------------------------------------------------
-- 3. VOCABULARIOS DE ESTADO (para referencia del código)
-- -----------------------------------------------------------------------------
-- ordenes_laboratorio.estado: 'EMITIDA' | 'EN_CURSO' | 'FINALIZADA'
-- =============================================================================