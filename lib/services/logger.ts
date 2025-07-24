// Enterprise-grade logging service
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  data?: any;
  error?: Error;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  private createLogEntry(
    level: LogLevel,
    service: string,
    message: string,
    data?: any,
    error?: Error
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
      data,
      error,
    };
  }

  private addLog(entry: LogEntry) {
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output with proper formatting
    const logMessage = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.service}] ${entry.message}`;
    
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(logMessage, entry.data);
        break;
      case LogLevel.INFO:
        console.info(logMessage, entry.data);
        break;
      case LogLevel.WARN:
        console.warn(logMessage, entry.data);
        break;
      case LogLevel.ERROR:
        console.error(logMessage, entry.error || entry.data);
        break;
    }
  }

  debug(service: string, message: string, data?: any) {
    this.addLog(this.createLogEntry(LogLevel.DEBUG, service, message, data));
  }

  info(service: string, message: string, data?: any) {
    this.addLog(this.createLogEntry(LogLevel.INFO, service, message, data));
  }

  warn(service: string, message: string, data?: any) {
    this.addLog(this.createLogEntry(LogLevel.WARN, service, message, data));
  }

  error(service: string, message: string, error?: Error | any) {
    this.addLog(this.createLogEntry(LogLevel.ERROR, service, message, undefined, error));
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }
}

export const logger = new Logger(); 