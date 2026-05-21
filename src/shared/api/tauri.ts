import { invoke } from "@tauri-apps/api/core";

export type AuthMethod = "Password" | "PubKey";

export type Credential = {
  username: string;
  auth_method: AuthMethod;
  password?: string | null;
  private_key?: string | null;
  private_key_path?: string | null;
  passphrase?: string | null;
};

export type SshConfig = {
  host: string;
  port: number;
  credential: Credential;
  jump_host?: string | null;
  timeout_secs: number;
  keepalive_interval?: number | null;
};

export type Connection = {
  id: string;
  name: string;
  description?: string | null;
  config: SshConfig;
  group_id?: string | null;
  created_at: string;
  last_used_at?: string | null;
  tags: string[];
};

export type Group = {
  id: string;
  name: string;
  parent_id?: string | null;
  color?: string | null;
  icon?: string | null;
};

export type SessionMetadata = {
  id: string;
  host: string;
  port: number;
  username: string;
  connected_at: string;
  last_activity: string;
};

export type SessionInfo = {
  metadata: SessionMetadata;
  active: boolean;
};

export type PortForwardInfo = {
  id: string;
  label: string;
  connection_id: string;
  connection_name: string;
  host: string;
  username: string;
  local_addr: string;
  remote_addr: string;
  created_at: string;
  last_started_at?: string | null;
  last_stopped_at?: string | null;
  status: "Connected" | "Disconnected";
};

export const api = {
  saveConnection: (connection: Connection) =>
    invoke<void>("save_connection", { connection }),
  getConnection: (id: string) =>
    invoke<Connection | null>("get_connection", { id }),
  getAllConnections: () => invoke<Connection[]>("get_all_connections"),
  updateConnection: (connection: Connection) =>
    invoke<void>("update_connection", { connection }),
  deleteConnection: (id: string) => invoke<void>("delete_connection", { id }),
  getConnectionsByGroup: (groupId: string) =>
    invoke<Connection[]>("get_connections_by_group", { groupId }),
  searchConnections: (query: string) =>
    invoke<Connection[]>("search_connections", { query }),

  saveGroup: (group: Group) => invoke<void>("save_group", { group }),
  getGroup: (id: string) => invoke<Group | null>("get_group", { id }),
  getAllGroups: () => invoke<Group[]>("get_all_groups"),
  updateGroup: (group: Group) => invoke<void>("update_group", { group }),
  deleteGroup: (id: string) => invoke<void>("delete_group", { id }),

  cryptoEncrypt: (plain: string) => invoke<string>("crypto_encrypt", { plain }),
  cryptoDecrypt: (cipher: string) =>
    invoke<string>("crypto_decrypt", { cipher }),
  cryptoHashPassword: (password: string, salt: number[]) =>
    invoke<number[]>("crypto_hash_password", { password, salt }),
  cryptoVerifyPassword: (password: string, hash: number[], salt: number[]) =>
    invoke<boolean>("crypto_verify_password", { password, hash, salt }),

  sshTestConnection: (config: SshConfig) =>
    invoke<boolean>("ssh_test_connection", { config }),
  sshExecCommand: (config: SshConfig, command: string) =>
    invoke<string>("ssh_exec_command", { config, command }),
  sshOpenSession: (config: SshConfig) =>
    invoke<string>("ssh_open_session", { config }),
  sshSendData: (sessionId: string, data: number[]) =>
    invoke<void>("ssh_send_data", { sessionId, data }),
  sshReadData: (sessionId: string, maxLen: number) =>
    invoke<number[]>("ssh_read_data", { sessionId, maxLen }),
  sshResize: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("ssh_resize", { sessionId, cols, rows }),
  sshCloseSession: (sessionId: string) =>
    invoke<void>("ssh_close_session", { sessionId }),
  sshSessionInfo: (sessionId: string) =>
    invoke<SessionInfo>("ssh_session_info", { sessionId }),
  sshStartLocalPortForward: (
    connection: Connection,
    label: string,
    localAddr: string,
    remoteAddr: string,
  ) =>
    invoke<PortForwardInfo>("ssh_start_local_port_forward", {
      connection,
      label,
      localAddr,
      remoteAddr,
    }),
  sshStopLocalPortForward: (forwardId: string) =>
    invoke<void>("ssh_stop_local_port_forward", { forwardId }),
  sshConnectSavedLocalPortForward: (forwardId: string) =>
    invoke<PortForwardInfo>("ssh_connect_saved_local_port_forward", {
      forwardId,
    }),
  sshDeleteLocalPortForward: (forwardId: string) =>
    invoke<void>("ssh_delete_local_port_forward", { forwardId }),
  sshListLocalPortForwards: () =>
    invoke<PortForwardInfo[]>("ssh_list_local_port_forwards"),
};
