// Side-effect module: imported first in main.tsx so the guard wraps fetch before any Firebase module is evaluated.
import { installNetGuard } from './netGuard';
installNetGuard();
