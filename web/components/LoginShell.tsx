import LoginForm from '@/app/login/LoginForm';
import LoveBackground from '@/components/LoveBackground';

/** The sign-in page: a soft, celebratory background with just the form in the middle. */
export default function LoginShell() {
  return (
    <div className="love-page">
      <LoveBackground />
      <main className="love-stage">
        <LoginForm />
      </main>
    </div>
  );
}
