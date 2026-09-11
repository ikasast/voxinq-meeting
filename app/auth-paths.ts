// Screens a person is on before anybody knows who they are.
//
// Anything offered here promises something the next tap would refuse: it leads straight back to
// the sign-in screen. The bottom bar learned that first. The New meeting link learned it when it
// stopped being hidden from outside — and an external visitor is exactly who stands on the
// sign-in screen.
export const AUTH_PATHS = [/^\/login$/, /^\/setup$/, /^\/reset\//];

export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((re) => re.test(pathname));
}
