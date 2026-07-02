import { SetMetadata } from '@nestjs/common';
import type { AdminScope } from '@onyu/shared';

export const REQUIRE_SCOPE_KEY = 'requireScope';

export const RequireScope = (...scopes: AdminScope[]) => SetMetadata(REQUIRE_SCOPE_KEY, scopes);
