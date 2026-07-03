// Bun returns an HTMLBundle for HTML imports; typed loosely for tsc.
declare module "*.html" {
  const html: import("bun").HTMLBundle;
  export default html;
}
