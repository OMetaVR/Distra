import type { EntityAuthor } from "enmity/common";
import type { GitInfo } from "../../git";

export interface LibManifest {
  name: string;
  description: string;
  color?: string;
  version: string;
  authors: EntityAuthor[];
}

interface LibSecretInfo {
  manifest: LibManifest,
  invite: string,
  id: string,
  git: GitInfo,
  IS_PROD: boolean
}

const secret: LibSecretInfo = (
  // @ts-expect-error unexposed pseudo var
  __lib_meta_data__
);

export const manifest: LibManifest = Object.assign(
  secret.manifest,
  // Because of the filename not being the same as the plugin name
  // enmity will error. because idk?
  { name: secret.id }
);

export const discordInvite: string = secret.invite;

export const git: GitInfo = secret.git;

export const IS_PROD: boolean = secret.IS_PROD;