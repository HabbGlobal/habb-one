import type { UserRole, TenantRegistrationStatus } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      companyId: string;
      preferredLanguage: string;
      registrationStatus: TenantRegistrationStatus;
    };
  }

  interface User {
    role: UserRole;
    companyId: string;
    preferredLanguage: string;
    sessionEpoch?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    companyId: string;
    preferredLanguage: string;
    sessionEpoch?: number;
  }
}
