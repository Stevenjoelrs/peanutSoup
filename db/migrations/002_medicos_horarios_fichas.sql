-- =============================================================================
-- PROYECTO: Sistema Web para el Seguro Social Universitario (SSU - UMSS)
-- MIGRACIÓN: 002_medicos_horarios_fichas.sql
-- DESCRIPCIÓN: Catálogo de médicos, agenda de atención y fichas reservadas
-- MOTOR: PostgreSQL 16/17 (compatible con Supabase Cloud)
-- -----------------------------------------------------------------------------
-- El modelo de atención del SSU es una cadena: una especialidad agrupa médicos,
-- un médico publica horarios concretos y sobre un horario se reserva una única
-- ficha. De ahí las dos unicidades que sostienen la integridad:
--   - un médico no puede tener dos horarios que empiecen a la misma hora;
--   - un horario no puede alojar más de una ficha (uq_ficha_horario).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA: especialidades
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS especialidades (
    id_especialidad UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 2. TABLA: medicos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medicos (
    id_medico UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_completo VARCHAR(150) NOT NULL,
    es_especialista BOOLEAN NOT NULL DEFAULT FALSE,
    id_especialidad UUID REFERENCES especialidades(id_especialidad),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_medicos_especialidad ON medicos(id_especialidad);

-- -----------------------------------------------------------------------------
-- 3. TABLA: horarios_atencion
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS horarios_atencion (
    id_horario UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_medico UUID NOT NULL REFERENCES medicos(id_medico) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    consultorio VARCHAR(20) NOT NULL,
    disponible BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_medico_horario UNIQUE (id_medico, fecha, hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_horarios_disponible_fecha ON horarios_atencion(disponible, fecha);
CREATE INDEX IF NOT EXISTS idx_horarios_fecha_disponibles ON horarios_atencion(fecha, disponible);
CREATE INDEX IF NOT EXISTS idx_horarios_medico ON horarios_atencion(id_medico);

-- -----------------------------------------------------------------------------
-- 4. TABLA: fichas_reservadas
-- tipo_ficha: 'GENERAL' | 'INCLUSIVA' | 'ESPECIALISTA'
-- estado:     'RESERVADA' | 'CONFIRMADA' | 'CANCELADA_USUARIO' | 'ASISTIO'
-- UNIQUE (id_horario): un horario solo admite una ficha.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fichas_reservadas (
    id_ficha UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_estudiante UUID NOT NULL REFERENCES estudiantes(id_estudiante) ON DELETE CASCADE,
    id_horario UUID NOT NULL REFERENCES horarios_atencion(id_horario) ON DELETE RESTRICT,
    tipo_ficha VARCHAR(20) NOT NULL DEFAULT 'GENERAL'
        CONSTRAINT fichas_reservadas_tipo_ficha_check CHECK (tipo_ficha IN ('GENERAL', 'INCLUSIVA', 'ESPECIALISTA')),
    estado VARCHAR(30) NOT NULL DEFAULT 'RESERVADA'
        CONSTRAINT fichas_medicas_estado_check CHECK (estado IN ('RESERVADA', 'CONFIRMADA', 'CANCELADA_USUARIO', 'ASISTIO')),
    fecha_reserva TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_ficha_horario UNIQUE (id_horario)
);

CREATE INDEX IF NOT EXISTS idx_fichas_estudiante ON fichas_reservadas(id_estudiante);
CREATE INDEX IF NOT EXISTS idx_fichas_horario ON fichas_reservadas(id_horario);

-- -----------------------------------------------------------------------------
-- AUDITORÍA: updated_at
-- -----------------------------------------------------------------------------
-- Aquí solo se crea la auditoría de `updated_at`.
--
-- La sincronización de `horarios_atencion.disponible` con las fichas reservadas
-- NO se define en este archivo a propósito. Conviene hacerlo en una migración
-- posterior junto con sus triggers, cuando exista la lógica de reserva de
-- ficha: liberar el turno en el DELETE debe considerar si queda otra ficha para
-- el mismo horario, y eso ya es una regla de negocio, no un detalle de esquema.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_especialidades_timestamp ON especialidades;
CREATE TRIGGER trg_update_especialidades_timestamp
    BEFORE UPDATE ON especialidades
    FOR EACH ROW EXECUTE FUNCTION fn_actualizar_updated_at();

DROP TRIGGER IF EXISTS trg_update_medicos_timestamp ON medicos;
CREATE TRIGGER trg_update_medicos_timestamp
    BEFORE UPDATE ON medicos
    FOR EACH ROW EXECUTE FUNCTION fn_actualizar_updated_at();

DROP TRIGGER IF EXISTS trg_update_horarios_timestamp ON horarios_atencion;
CREATE TRIGGER trg_update_horarios_timestamp
    BEFORE UPDATE ON horarios_atencion
    FOR EACH ROW EXECUTE FUNCTION fn_actualizar_updated_at();
