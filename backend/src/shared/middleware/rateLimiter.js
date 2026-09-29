export const crearLimitador = ({
  windowMs = 15 * 60 * 1000,
  max = 10,
  message = {
    success: false,
    message: 'Demasiados intentos de acceso desde esta dirección IP. Por favor, intente nuevamente en 15 minutos.',
    error: null,
    timestamp: new Date().toISOString()
  }
} = {}) => {
  const registro = new Map();

  const timer = setInterval(() => {
    const ahora = Date.now();
    for (const [ip, datos] of registro.entries()) {
      if (ahora > datos.resetAt) {
        registro.delete(ip);
      }
    }
  }, 5 * 60 * 1000);

  if (timer.unref) {
    timer.unref();
  }

  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    const ahora = Date.now();

    let record = registro.get(ip);

    if (!record || ahora > record.resetAt) {
      record = { intentos: 1, resetAt: ahora + windowMs };
      registro.set(ip, record);
    } else {
      record.intentos += 1;
    }

    const restantes = Math.max(0, max - record.intentos);
    const segundosRestantes = Math.ceil((record.resetAt - ahora) / 1000);

    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', restantes);
    res.setHeader('RateLimit-Reset', segundosRestantes);

    if (record.intentos > max) {
      res.setHeader('Retry-After', segundosRestantes);
      return res.status(429).json(
        typeof message === 'object'
          ? { ...message, timestamp: new Date().toISOString() }
          : {
              success: false,
              message,
              error: null,
              timestamp: new Date().toISOString()
            }
      );
    }

    return next();
  };
};
