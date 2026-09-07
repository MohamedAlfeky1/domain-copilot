/**
 * In-memory registry of active Run abort controllers for server-side cancellation (RT-003).
 */

class RunControllerRegistry {
  private controllers: Map<string, AbortController> = new Map();

  createController(runId: string): AbortController {
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    return controller;
  }

  getSignal(runId: string): AbortSignal | undefined {
    return this.controllers.get(runId)?.signal;
  }

  cancelRun(runId: string): boolean {
    const controller = this.controllers.get(runId);
    if (controller) {
      controller.abort();
      this.controllers.delete(runId);
      return true;
    }
    return false;
  }

  cleanup(runId: string) {
    this.controllers.delete(runId);
  }
}

export const runControllerRegistry = new RunControllerRegistry();
