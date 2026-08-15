import { AUTH0_DOMAIN, AUTH0_CLIENT_ID, startSocialLogin, type SocialConnection } from "@/lib/auth";
import { GoogleIcon, MicrosoftIcon, FacebookIcon } from "@/components/SocialIcons";

const SOCIAL_BUTTON_STYLE = {
  backgroundColor: "#fff",
  borderColor: "#dadce0",
  color: "#3c4043",
  boxShadow: "0 1px 3px rgba(60,64,67,0.12)",
} as const;

const SOCIAL_BUTTONS: Array<{
  connection: SocialConnection;
  label: string;
  Icon: () => JSX.Element;
}> = [
  { connection: "google-oauth2", label: "Continue with Google",    Icon: GoogleIcon },
  { connection: "windowslive",   label: "Continue with Microsoft", Icon: MicrosoftIcon },
  { connection: "facebook",      label: "Continue with Facebook",  Icon: FacebookIcon },
];

interface SocialLoginButtonsProps {
  returnTo?: string;
  divider?: boolean;
}

export function SocialLoginButtons({ returnTo, divider = true }: SocialLoginButtonsProps) {
  if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) return null;

  return (
    <div className="mb-5">
      <div className="flex flex-col gap-2">
        {SOCIAL_BUTTONS.map(({ connection, label, Icon }) => (
          <button
            key={connection}
            type="button"
            onClick={() => startSocialLogin(connection, returnTo)}
            className="flex w-full items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all border hover:shadow-md active:scale-[0.99] whitespace-nowrap"
            style={SOCIAL_BUTTON_STYLE}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {divider && (
        <div className="relative my-5 flex items-center">
          <div className="flex-1 border-t border-border" />
          <span className="mx-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">or</span>
          <div className="flex-1 border-t border-border" />
        </div>
      )}
    </div>
  );
}
