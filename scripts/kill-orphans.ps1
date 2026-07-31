# Limpia los workers huérfanos de `next dev` antes de arrancar el server (predev).
#
# En Windows, cerrar la terminal a lo bruto (con la X, no con Ctrl+C) deja vivos a
# los procesos hijos que Turbopack levanta (next/turbopack): quedan huérfanos, se
# acumulan entre sesiones y terminan agotando la RAM, por lo que un `next dev`
# nuevo revienta con "JavaScript heap out of memory".
#
# Este script mata SÓLO los node.exe de next/turbopack (no toca Claude Code ni
# otros node). Corre antes de `npm run dev`, así que los workers de la sesión que
# estás por arrancar todavía no existen: sólo limpia los de sesiones anteriores.
# Best-effort: si algo falla, igual dejamos que el dev arranque (exit 0).
#
# Nota: si tenés a propósito DOS `npm run dev` a la vez, este predev mataría el
# primero al arrancar el segundo.
try {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'next|turbopack' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch { }
exit 0
