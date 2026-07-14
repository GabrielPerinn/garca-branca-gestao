interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  eyebrow?: string;
}

export function PageHeader({ title, description, action, eyebrow }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="app-kicker mb-1.5">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] text-foreground sm:text-[2rem]">
          {title}
        </h1>
        {description && (
          <div className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {action && (
        <div className="w-full shrink-0 [&>*]:w-full sm:w-auto sm:[&>*]:w-auto">
          {action}
        </div>
      )}
    </header>
  );
}
