const PREFIX = 'taller3d:';

export function cargar(clave, porDefecto) {
  try {
    const raw = localStorage.getItem(PREFIX + clave);
    return raw ? { ...porDefecto, ...JSON.parse(raw) } : { ...porDefecto };
  } catch {
    return { ...porDefecto };
  }
}

export function guardar(clave, valor) {
  try {
    localStorage.setItem(PREFIX + clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}
