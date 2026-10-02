-- =============================================================================
-- PROYECTO: Sistema Web para el Seguro Social Universitario (SSU - UMSS)
-- MIGRACIÓN: 005_cancelar_ficha_libera_horario.sql
-- DESCRIPCIÓN: Sustituye el UNIQUE (id_horario) de fichas_reservadas por un
--              índice único parcial que solo protege las fichas activas, para
--              que una ficha CANCELADA_USUARIO libere su horario.
-- MOTOR: PostgreSQL 16/17 (compatible con Supabase Cloud)
-- -----------------------------------------------------------------------------
-- Antes: UNIQUE (id_horario) sin mirar estado. Un horario solo podía alojar UNA
-- ficha en toda su vida, así que cancelar la existente dejaba el horario
-- "ocupado" para siempre aunque pusiéramos disponible = TRUE.
--
-- Ahora: la regla se aplica solo a las fichas vigentes (RESERVADA o CONFIRMADA).
-- Varias fichas CANCELADA_USUARIO o ASISTIO pueden compartir horario, pero una
-- sola puede estar activa. El doble booking activo sigue prohibido; el re-booking
-- tras cancelar se vuelve posible.
-- =============================================================================

ALTER TABLE fichas_reservadas DROP CONSTRAINT IF EXISTS uq_ficha_horario;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ficha_activa_por_horario
    ON fichas_reservadas (id_horario)
    WHERE estado IN ('RESERVADA', 'CONFIRMADA');
