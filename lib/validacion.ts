// Reglas de validación de datos personales (Spec 19). Módulo puro: sin
// imports de servidor ni de React, para que lo usen tanto las Server Actions
// como los formularios cliente (validación al salir de cada campo) y los
// mensajes nunca se desincronicen.
//
// Cada validador recibe el valor crudo del formulario y devuelve el valor
// normalizado —el que se guarda— o el mensaje de error.

export type Resultado = { ok: true; valor: string } | { ok: false; error: string };

// Errores por campo que devuelven las Server Actions.
export type ErroresCampo<C extends string> = Partial<Record<C, string>>;

function ok(valor: string): Resultado {
  return { ok: true, valor };
}

function error(mensaje: string): Resultado {
  return { ok: false, error: mensaje };
}

// trim + espacios internos repetidos colapsados a uno.
function limpiarEspacios(crudo: string): string {
  return crudo.trim().replace(/\s+/g, " ");
}

// Letras (con tildes, ü, ñ y cualquier otra letra Unicode), espacio,
// apóstrofo y guion; empieza con letra.
const NOMBRE_PERSONA_RE = /^\p{L}[\p{L}\p{M} '’-]*$/u;
// Lo mismo, más dígitos, punto y &; empieza con letra o dígito.
const NOMBRE_EMPRESA_RE = /^[\p{L}\d][\p{L}\p{M}\d .&'’-]*$/u;

export function validarNombrePersona(
  crudo: string,
  etiqueta: "nombre" | "apellido" = "nombre",
  mensajeVacio = `Ingresá tu ${etiqueta}.`,
): Resultado {
  const valor = limpiarEspacios(crudo);
  if (!valor) return error(mensajeVacio);
  if (valor.length < 2 || valor.length > 40) {
    return error("Tiene que tener entre 2 y 40 caracteres.");
  }
  if (!NOMBRE_PERSONA_RE.test(valor)) {
    return error("Usá sólo letras, espacios, apóstrofo o guion.");
  }
  return ok(valor);
}

// Nombre y apellido en un solo campo, como lo edita /perfil/editar: misma
// regla de caracteres, con el largo de nombre + espacio + apellido (40 + 1 + 40).
export function validarNombreCompleto(crudo: string): Resultado {
  const valor = limpiarEspacios(crudo);
  if (!valor) return error("Ingresá tu nombre y apellido.");
  if (valor.length < 2 || valor.length > 81) {
    return error("Tiene que tener entre 2 y 81 caracteres.");
  }
  if (!NOMBRE_PERSONA_RE.test(valor)) {
    return error("Usá sólo letras, espacios, apóstrofo o guion.");
  }
  return ok(valor);
}

// Nombre del contacto de confianza: misma regla, otro mensaje si está vacío.
export function validarNombreContacto(crudo: string): Resultado {
  return validarNombrePersona(crudo, "nombre", "Ingresá el nombre del contacto.");
}

export function validarNombreEmpresa(crudo: string): Resultado {
  const valor = limpiarEspacios(crudo);
  if (!valor) return error("Ingresá el nombre de la remisería.");
  if (valor.length < 2 || valor.length > 60) {
    return error("Tiene que tener entre 2 y 60 caracteres.");
  }
  if (!NOMBRE_EMPRESA_RE.test(valor)) {
    return error("Usá letras, números, espacios, punto, guion o &.");
  }
  return ok(valor);
}

// Lleva un teléfono argentino escrito de cualquier forma (+54 9, 0, 15,
// espacios, guiones, paréntesis) a 10 dígitos: código de área + número.
// Devuelve null si no se llega a 10 dígitos. Misma lógica que
// public.normalizar_telefono() en la migración 0019.
export function normalizarTelefono(crudo: string): string | null {
  let d = crudo.replace(/\D/g, "");
  if (d.startsWith("54") && d.length >= 12) d = d.slice(2);
  if (d.startsWith("9") && d.length === 11) d = d.slice(1);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 12) {
    // El 15 del celular va después del código de área, que tiene 2, 3 o 4 dígitos.
    for (const pos of [2, 3, 4]) {
      if (d.slice(pos, pos + 2) === "15") {
        d = d.slice(0, pos) + d.slice(pos + 2);
        break;
      }
    }
  }
  return /^\d{10}$/.test(d) ? d : null;
}

export function validarTelefono(crudo: string): Resultado {
  if (!crudo.trim()) return error("Ingresá tu teléfono.");
  const valor = normalizarTelefono(crudo);
  if (!valor) {
    return error("Ingresá el código de área y el número, por ejemplo 341 555-1234.");
  }
  return ok(valor);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarEmail(crudo: string): Resultado {
  const valor = crudo.trim().toLowerCase();
  if (!valor || valor.length > 254 || !EMAIL_RE.test(valor)) {
    return error("Ingresá un email válido.");
  }
  return ok(valor);
}

// Formato viejo (ABC123) o Mercosur (AB123CD).
const PATENTE_RE = /^([A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2})$/;

export function validarPatente(crudo: string): Resultado {
  const valor = crudo.replace(/[\s.-]/g, "").toUpperCase();
  if (!valor) return error("Ingresá la patente.");
  if (!PATENTE_RE.test(valor)) {
    return error("La patente tiene que ser como ABC123 o AB123CD.");
  }
  return ok(valor);
}

// Marcas que se venden en Argentina, en orden alfabético. Agregar una marca
// es sólo sumarla acá: la base no tiene CHECK con esta lista.
export const MARCAS = [
  "Alfa Romeo",
  "Audi",
  "BAIC",
  "BMW",
  "BYD",
  "Chery",
  "Chevrolet",
  "Chrysler",
  "Citroën",
  "Dodge",
  "DS",
  "Fiat",
  "Ford",
  "Geely",
  "Haval",
  "Honda",
  "Hyundai",
  "JAC",
  "Jeep",
  "Kia",
  "Lifan",
  "Mercedes-Benz",
  "Mini",
  "Mitsubishi",
  "Nissan",
  "Peugeot",
  "RAM",
  "Renault",
  "Seat",
  "Subaru",
  "Suzuki",
  "Toyota",
  "Volkswagen",
  "Volvo",
] as const;

// Tiene que coincidir exactamente (mayúsculas y tildes) con el CHECK
// vehicles_color_lista de la migración 0020: agregar un color es sumarlo acá
// y en una migración nueva que reemplace ese CHECK.
export const COLORES = [
  "Blanco",
  "Negro",
  "Gris",
  "Plata",
  "Rojo",
  "Bordó",
  "Azul",
  "Celeste",
  "Verde",
  "Amarillo",
  "Naranja",
  "Marrón",
  "Beige",
  "Dorado",
  "Violeta",
] as const;

// Busca el valor en la lista ignorando mayúsculas, tildes y espacios al borde,
// y devuelve la forma canónica de la lista.
function enLista(crudo: string, lista: readonly string[]): string | null {
  const clave = (v: string) =>
    v.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const buscado = clave(crudo);
  return lista.find((v) => clave(v) === buscado) ?? null;
}

export function validarMarca(crudo: string): Resultado {
  if (!crudo.trim()) return error("Elegí la marca.");
  const valor = enLista(crudo, MARCAS);
  return valor ? ok(valor) : error("Elegí una marca de la lista.");
}

export function validarColor(crudo: string): Resultado {
  if (!crudo.trim()) return error("Elegí el color.");
  const valor = enLista(crudo, COLORES);
  return valor ? ok(valor) : error("Elegí un color de la lista.");
}

export function validarTextoVehiculo(crudo: string, etiqueta: "modelo"): Resultado {
  const valor = limpiarEspacios(crudo);
  if (!valor) return error(`Completá el ${etiqueta}.`);
  if (valor.length < 2 || valor.length > 30) {
    return error("Tiene que tener entre 2 y 30 caracteres.");
  }
  return ok(valor);
}

// Igual que el CHECK vehicles_capacidad_rango de la migración 0020.
export const CAPACIDAD_MAX = 6;

export function validarCapacidad(
  crudo: string,
): { ok: true; valor: number } | { ok: false; error: string } {
  const valor = Number(crudo);
  if (!crudo.trim() || !Number.isInteger(valor) || valor < 1 || valor > CAPACIDAD_MAX) {
    return {
      ok: false,
      error: `La capacidad debe ser un número entero entre 1 y ${CAPACIDAD_MAX}.`,
    };
  }
  return { ok: true, valor };
}
