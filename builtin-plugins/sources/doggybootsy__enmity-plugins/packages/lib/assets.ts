import { Asset } from "enmity/api/assets";
export { Asset } from "enmity/api/assets";

export function getIDByName(name: string): number {
  const id = window.enmity.assets.getIDByName(name);

  if (typeof id === "undefined") {
    throw new Error(`Asset Id by the name of '${name}' is undefined`)
  }
  return id;
}

export function getByName(name: string): Asset {
  const asset = window.enmity.assets.getByName(name);

  if (typeof asset === "undefined") {
    throw new Error(`Asset by the name of '${name}' is undefined`)
  }
  return asset;
}

export function getById(id: string): Asset {
  const asset = window.enmity.assets.getByID(id);

  if (typeof asset === "undefined") {
    throw new Error(`Asset by the id of '${id}' is undefined`)
  }
  return asset;
}