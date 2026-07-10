export function createPostgresParameterBinder() {
  const values = [];

  function bind(value, cast = "") {
    values.push(value);
    return `$${values.length}${cast ? `::${cast}` : ""}`;
  }

  return {
    values,
    text(value) {
      return bind(String(value ?? ""), "text");
    },
    nullableText(value) {
      const text = String(value ?? "").trim();
      return bind(text || null, "text");
    },
    integer(value) {
      return bind(toFiniteInteger(value), "integer");
    },
    nullableInteger(value) {
      return bind(value === null || value === undefined || value === "" ? null : toFiniteInteger(value), "integer");
    },
    number(value) {
      return bind(toFiniteNumber(value), "numeric");
    },
    nullableNumber(value) {
      const number = Number(value);
      return bind(Number.isFinite(number) ? number : null, "numeric");
    },
    boolean(value) {
      return bind(Boolean(value), "boolean");
    },
    json(value) {
      return bind(JSON.stringify(value ?? null), "jsonb");
    },
    timestamp(value) {
      const text = String(value ?? "").trim();
      return text ? bind(text, "timestamptz") : "now()";
    },
    nullableTimestamp(value) {
      const text = String(value ?? "").trim();
      return !text || Number.isNaN(Date.parse(text)) ? "NULL" : bind(text, "timestamptz");
    },
    textArray(value) {
      const items = Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
      return bind(items, "text[]");
    },
  };
}

function toFiniteInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
