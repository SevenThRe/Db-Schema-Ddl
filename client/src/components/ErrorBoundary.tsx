import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiRequestError, translateApiError } from "@/lib/api-error";
import { withTranslation, type WithTranslation } from "react-i18next";

interface BaseProps extends WithTranslation {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isDeveloperMode: boolean;
}

class ErrorBoundaryBase extends Component<BaseProps, State> {
  constructor(props: BaseProps) {
    super(props);

    const savedMode = localStorage.getItem("developerMode");

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isDeveloperMode: savedMode === "true",
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.reload();
  };

  toggleDeveloperMode = () => {
    const newMode = !this.state.isDeveloperMode;
    localStorage.setItem("developerMode", String(newMode));
    this.setState({ isDeveloperMode: newMode });
  };

  renderDeveloperDetails() {
    const { t } = this.props;
    const { error, errorInfo } = this.state;
    if (!this.state.isDeveloperMode || !error) {
      return null;
    }

    const translated = translateApiError(error, t, { includeIssues: true, maxIssues: 5 });
    const apiError = error instanceof ApiRequestError ? error : null;

    return (
      <div className="bg-slate-950 rounded-lg p-4 space-y-3 border border-red-500/20">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-sm text-red-400">{t("errorBoundary.devTitle")}</h3>
          <span className="text-xs text-slate-500">{error.name}</span>
        </div>

        <div className="space-y-2">
          {apiError?.code && (
            <div>
              <div className="text-xs text-slate-400 mb-1">{t("errorBoundary.errorCode")}</div>
              <div className="text-sm text-amber-300 font-mono">{apiError.code}</div>
            </div>
          )}
          {apiError?.requestId && (
            <div>
              <div className="text-xs text-slate-400 mb-1">{t("errorBoundary.requestId")}</div>
              <div className="text-xs text-slate-300 font-mono break-all">{apiError.requestId}</div>
            </div>
          )}

          <div>
            <div className="text-xs text-slate-400 mb-1">{t("errorBoundary.errorMessage")}</div>
            <div className="text-sm text-red-300 font-mono whitespace-pre-wrap break-words">
              {translated.description}
            </div>
          </div>

          {error.stack && (
            <div>
              <div className="text-xs text-slate-400 mb-1">{t("errorBoundary.stackTrace")}</div>
              <pre className="text-xs text-slate-300 overflow-auto max-h-64 bg-slate-900 p-3 rounded">
                {error.stack}
              </pre>
            </div>
          )}

          {errorInfo?.componentStack && (
            <div>
              <div className="text-xs text-slate-400 mb-1">{t("errorBoundary.componentStack")}</div>
              <pre className="text-xs text-slate-300 overflow-auto max-h-64 bg-slate-900 p-3 rounded">
                {errorInfo.componentStack}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { t } = this.props;

    return (
      <div className="h-screen w-full flex items-center justify-center bg-background p-8">
        <div className="max-w-2xl w-full space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t("errorBoundary.title")}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t("errorBoundary.subtitle")}</p>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <h2 className="font-semibold text-foreground">{t("errorBoundary.solutionsTitle")}</h2>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>{t("errorBoundary.solutionReload")}</li>
              <li>{t("errorBoundary.solutionRestart")}</li>
              <li>{t("errorBoundary.solutionF12")}</li>
              <li>{t("errorBoundary.solutionDevMode")}</li>
            </ul>
          </div>

          {this.renderDeveloperDetails()}

          <div className="flex items-center gap-3">
            <Button onClick={this.handleReset} className="flex-1">
              {t("errorBoundary.reloadApp")}
            </Button>
            <Button
              onClick={this.toggleDeveloperMode}
              variant={this.state.isDeveloperMode ? "default" : "outline"}
              className="flex-1"
            >
              {this.state.isDeveloperMode
                ? t("errorBoundary.disableDeveloperMode")
                : t("errorBoundary.enableDeveloperMode")}
            </Button>
          </div>

          <div className="text-xs text-center text-muted-foreground space-y-1">
            <p>{t("errorBoundary.hintF12")}</p>
            <p className="text-[10px]">{t("errorBoundary.hintPersisted")}</p>
          </div>
        </div>
      </div>
    );
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryBase);
