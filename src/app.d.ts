declare global {
  namespace App {
    interface Locals {
      locale: import('$lib/paraglide/runtime.js').Locale;
    }
  }
}

export {};
