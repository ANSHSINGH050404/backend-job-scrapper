interface MemoryAgentInput {
    action: "save" | "update" | "retrieve" | "delete";
    entity: "job" | "application" | "email" | "company";
    data: Record<string, any>;
    userId: string;
  }
  interface MemoryAgentOutput {
    success: boolean;
    entityId: string;
    timestamp: Date;
    error?: string;
  }