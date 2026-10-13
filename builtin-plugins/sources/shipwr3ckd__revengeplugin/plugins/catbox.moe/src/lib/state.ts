let nextDuration: string | null = null;

export function setCloseDuration(duration: string) {
  nextDuration = duration;
}

export function getCloseDuration(): string | null {
  const temp = nextDuration;
  nextDuration = null;
  return temp;
}