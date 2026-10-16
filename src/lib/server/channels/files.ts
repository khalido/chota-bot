/**
 * Files people send (photos, voice notes) are kept per chat — a person's DMs
 * or the group — under `data/files/<thread>/`, so the agent and family can
 * find them later. Nothing here leaves the box.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'audio/ogg': 'ogg',
	'audio/mpeg': 'mp3',
	'audio/mp4': 'm4a'
};

/** `wa:120…@g.us` → `wa-120…-g.us` — safe as a file or folder name. */
const folderOf = (threadId: string) => threadId.replace(/[^\w.-]+/g, '-');

export async function saveFile(
	threadId: string,
	messageId: string,
	mimetype: string,
	data: Buffer
) {
	const dir = join('data', 'files', folderOf(threadId));
	await mkdir(dir, { recursive: true });
	const base = mimetype.split(';')[0].trim();
	const path = join(dir, `${Date.now()}-${folderOf(messageId)}.${EXT[base] ?? 'bin'}`);
	await writeFile(path, data);
	return path;
}
