// Side effect only (ADR 0045 QĐ1): the embed entry imports this first, so the component modules it imports after
// it do not define anything on the page's global custom element registry.
import { suppressAutoDefine } from '../base/define.js';

suppressAutoDefine();
