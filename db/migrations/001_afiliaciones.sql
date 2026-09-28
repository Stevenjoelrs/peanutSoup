-- =============================================================================
-- PROYECTO: Sistema Web para el Seguro Social Universitario (SSU - UMSS)
-- MIGRACIÓN: 001_afiliaciones.sql
-- DESCRIPCIÓN: Padrón de estudiantes y control de periodos de afiliación
-- MOTOR: PostgreSQL 16/17 (compatible con Supabase Cloud)
-- -----------------------------------------------------------------------------
-- El padrón se replica desde el sistema universitario: el SSU no da de alta
-- estudiantes, solo los consulta. `estudiantes` es la única fuente de verdad de
-- quién puede afiliarse, y por eso nace antes que cualquier otra tabla.
--
-- Es la primera migración del proyecto: define el vocabulario de estados que usa
-- el código de la aplicación y el resto del esquema se apoya en estas dos
-- tablas.
-- =============================================================================

-- Extensiones requeridas para generación de UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. TABLA: estudiantes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estudiantes (
    id_estudiante UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sis VARCHAR(20) NOT NULL UNIQUE,
    cedula_identidad VARCHAR(20) NOT NULL UNIQUE,
    nombre_completo VARCHAR(150) NOT NULL,
    facultad VARCHAR(100) NOT NULL,
    carrera VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 2. TABLA: afiliaciones
-- Estado: 'ACTIVA' | 'INACTIVA'
-- La condición de "vencida" se deriva de fecha_vencimiento (no se almacena).
-- UNIQUE (id_estudiante, periodo_semestral) impide afiliaciones duplicadas
-- del mismo periodo para un mismo estudiante.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS afiliaciones (
    id_afiliacion UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_estudiante UUID NOT NULL REFERENCES estudiantes(id_estudiante) ON DELETE CASCADE,
    periodo_semestral VARCHAR(10) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA'
        CONSTRAINT afiliaciones_estado_check CHECK (estado IN ('ACTIVA', 'INACTIVA')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_estudiante_periodo UNIQUE (id_estudiante, periodo_semestral)
);

CREATE INDEX IF NOT EXISTS idx_afiliaciones_estudiante ON afiliaciones(id_estudiante);
CREATE INDEX IF NOT EXISTS idx_afiliaciones_estudiante_periodo ON afiliaciones(id_estudiante, periodo_semestral, estado);
CREATE INDEX IF NOT EXISTS idx_afiliaciones_vencimiento ON afiliaciones(fecha_vencimiento);
