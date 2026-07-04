import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      isPlatformAdmin: boolean;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? "dashflo-dev-secret-change-in-production",
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        const db = await getDb();
        const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
        if (!user) return null;
        const valid = bcrypt.compareSync(password, user.passwordHash);
        if (!valid) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isPlatformAdmin: user.isPlatformAdmin,
        } as { id: string; email: string; name: string; isPlatformAdmin: boolean };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = (user as { id: string }).id;
        token.isPlatformAdmin = (user as { isPlatformAdmin?: boolean }).isPlatformAdmin ?? false;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = String(token.userId ?? "");
      session.user.isPlatformAdmin = Boolean(token.isPlatformAdmin);
      return session;
    },
  },
});
