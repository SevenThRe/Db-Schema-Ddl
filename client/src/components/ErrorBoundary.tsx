import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isDeveloperMode: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);

    // 从 localStorage 读取开发者模式设置
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

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full flex items-center justify-center bg-background p-8">
          <div className="max-w-2xl w-full space-y-6">
            {/* 错误标题 */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">应用程序错误</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  应用在运行时遇到了一个意外错误
                </p>
              </div>
            </div>

            {/* 用户友好提示 */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h2 className="font-semibold text-foreground">可能的解决方案：</h2>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>点击下方按钮重新加载应用</li>
                <li>如果问题持续，请尝试重启应用</li>
                <li>按 F12 打开开发者工具查看详细错误</li>
                <li>启用开发者模式查看错误堆栈</li>
              </ul>
            </div>

            {/* 开发者模式 */}
            {this.state.isDeveloperMode && this.state.error && (
              <div className="bg-slate-950 rounded-lg p-4 space-y-3 border border-red-500/20">
                <div className="flex items-center justify-between">
                  <h3 className="font-mono text-sm text-red-400">错误详情（开发者模式）</h3>
                  <span className="text-xs text-slate-500">
                    {this.state.error.name}
                  </span>
                </div>

                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">错误消息：</div>
                    <div className="text-sm text-red-300 font-mono">
                      {this.state.error.message}
                    </div>
                  </div>

                  {this.state.error.stack && (
                    <div>
                      <div className="text-xs text-slate-400 mb-1">堆栈跟踪：</div>
                      <pre className="text-xs text-slate-300 overflow-auto max-h-64 bg-slate-900 p-3 rounded">
                        {this.state.error.stack}
                      </pre>
                    </div>
                  )}

                  {this.state.errorInfo && (
                    <div>
                      <div className="text-xs text-slate-400 mb-1">组件堆栈：</div>
                      <pre className="text-xs text-slate-300 overflow-auto max-h-64 bg-slate-900 p-3 rounded">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex items-center gap-3">
              <Button onClick={this.handleReset} className="flex-1">
                重新加载应用
              </Button>
              <Button
                onClick={this.toggleDeveloperMode}
                variant={this.state.isDeveloperMode ? "default" : "outline"}
                className="flex-1"
              >
                {this.state.isDeveloperMode ? "关闭" : "启用"}开发者模式
              </Button>
            </div>

            {/* 提示信息 */}
            <div className="text-xs text-center text-muted-foreground space-y-1">
              <p>提示：按 F12 可以打开开发者工具查看控制台日志</p>
              <p className="text-[10px]">
                开发者模式设置已保存到本地存储，重启应用后仍然有效
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
