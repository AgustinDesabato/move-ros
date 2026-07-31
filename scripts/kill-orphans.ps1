# Limpia lo que deje colgado el dev server. Se usa como:
#   - predev: corre solo antes de cada `npm run dev`.
#   - stop:   `npm run stop` para frenar el server a mano.
#
# En Windows, cerrar la terminal a lo bruto (con la X, no con Ctrl+C) deja vivos
# los procesos hijos que Turbopack levanta (next/turbopack): quedan huérfanos, se
# acumulan entre sesiones y terminan agotando la RAM, por lo que un `next dev`
# nuevo revienta con "JavaScript heap out of memory" o no arranca porque el puerto
# sigue ocupado.
#
# Hace dos cosas, ambas best-effort (si algo falla, igual sale con exit 0):
#   1) Mata los node.exe de next/turbopack (no toca otros node ni Claude Code).
#   2) Libera el puerto 3000 (el del dev server) matando lo que lo tenga tomado,
#      por si quedó algo colgado que no matchea por nombre.
#
# Nota: si corrés DOS `npm run dev` a la vez a propósito, esto mataría el primero.

# 1) node.exe de next/turbopack (los workers que se acumulan)
try {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'next|turbopack' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch { }

# 2) lo que sea que quedó escuchando en el puerto 3000
try {
  Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
} catch { }

exit 0
