import { SearchInput } from "../../ui/Controls";
import { useSearchText } from "../../ui/useSearchText";

/** Text in the user id, as you type. */
export function UserSearch({ value }: { value: string }) {
  const [text, setText] = useSearchText(value, { page: null });
  return <SearchInput value={text} onChange={setText} placeholder="Find a user by id…" />;
}
