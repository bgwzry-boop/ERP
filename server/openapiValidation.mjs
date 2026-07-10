import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(serverDir, "..");
const defaultOpenApiPath = path.join(repoRoot, "docs/development/erp-api-openapi-draft.yaml");

const rubyValidator = String.raw`
require "json"
require "yaml"

file = ARGV.fetch(0)
data = YAML.load_file(file)
refs = []

walk = lambda do |obj|
  case obj
  when Hash
    obj.each do |key, value|
      refs << value if key == "$ref"
      walk.call(value)
    end
  when Array
    obj.each { |value| walk.call(value) }
  end
end

walk.call(data)

missing = refs.uniq.reject do |ref|
  next false unless ref.start_with?("#/")
  parts = ref.delete_prefix("#/").split("/").map { |part| part.gsub("~1", "/").gsub("~0", "~") }
  cursor = data
  parts.all? { |part| cursor.is_a?(Hash) && cursor.key?(part) && (cursor = cursor[part]; true) }
end

puts JSON.generate(
  openapi: data["openapi"],
  title: data.dig("info", "title"),
  pathCount: data.fetch("paths", {}).size,
  schemaCount: data.dig("components", "schemas").to_h.size,
  tagCount: data.fetch("tags", []).size,
  refCount: refs.uniq.size,
  missingRefs: missing,
  valid: missing.empty?
)
`;

export function validateOpenApi(openApiPath = defaultOpenApiPath) {
  const output = execFileSync("ruby", ["-e", rubyValidator, openApiPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  return {
    file: path.relative(repoRoot, openApiPath),
    ...JSON.parse(output),
  };
}

export function tryValidateOpenApi(openApiPath = defaultOpenApiPath) {
  try {
    return validateOpenApi(openApiPath);
  } catch (error) {
    return {
      file: path.relative(repoRoot, openApiPath),
      valid: false,
      error: error.message,
    };
  }
}
