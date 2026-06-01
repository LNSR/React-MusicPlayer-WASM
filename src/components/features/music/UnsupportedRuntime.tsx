import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMusicRuntimeContext } from "@/context/AppContext/useMusicRuntimeContext";

export function UnsupportedRuntime() {
  const { capabilities } = useMusicRuntimeContext();

  return (
    <section className="grid h-full place-items-center rounded-lg bg-background p-6">
      <div className="music-state-card max-w-xl">
        <div className="mb-4 flex items-center gap-3">
          <AlertTriangle className="size-5 text-amber-300" />
          <h2 className="text-lg font-semibold">Secure runtime required</h2>
        </div>

        <p className="text-sm text-muted-foreground">
          Your current environment does not support the necessary capabilities.
          See{" "}
          <a
            className="inline-flex items-center gap-1 font-bold underline transition-colors hover:text-primary"
            href="https://developer.mozilla.org/en-US/docs/Web/API/File_System_API#browser_compatibility"
            target="_blank"
            rel="noopener noreferrer"
          >
            browser compatibility
            <ArrowUpRight className="size-3.5" />
          </a>
        </p>

        <div className="mt-5 grid gap-2">
          {capabilities.map((capability) => (
            <div
              key={capability.label}
              className="music-state-list-item"
            >
              <span>{capability.label}</span>
              <Badge variant={capability.supported ? "secondary" : "warning"}>
                {capability.supported ? "Available" : "Missing"}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
