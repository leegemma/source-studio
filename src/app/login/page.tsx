"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../components/Button";
import { ErrorComp } from "../../components/Error";

const LoginPage: React.FC = () => {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (json.type === "error") {
        throw new Error(json.message);
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <form onSubmit={onSubmit} className="flex w-72 flex-col gap-3">
        <span className="text-sm text-subtitle text-center mb-2">source-studio</span>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          placeholder="비밀번호"
          className="rounded-geist bg-background px-2.5 py-2 text-foreground text-sm border border-unfocused-border-color focus:border-focused-border-color outline-none"
        />
        <Button primary disabled={loading} loading={loading}>
          입장
        </Button>
        {error ? <ErrorComp message={error}></ErrorComp> : null}
      </form>
    </div>
  );
};

export default LoginPage;
