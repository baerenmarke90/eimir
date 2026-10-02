// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import copy from '../i18n/locales/contextTags';
import { ContextTagEditor } from './ContextTagEditor';

afterEach(cleanup);

function Editor({
  initial = [],
  submit = vi.fn(),
  dirty = vi.fn(),
}: {
  initial?: string[];
  submit?: (tags: FormDataEntryValue[]) => void;
  dirty?: (value: boolean) => void;
}) {
  const [tags, setTags] = useState(initial);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(new FormData(event.currentTarget).getAll('tags'));
      }}
    >
      <ContextTagEditor
        selected={tags}
        onChange={setTags}
        suggestions={['home']}
        labelForTag={(tag) => tag}
        onDraftChange={dirty}
      />
      <button type="submit">Save moment</button>
    </form>
  );
}

it('Enter adds a normalized authored tag without submitting, and removal returns focus to the input', async () => {
  const user = userEvent.setup();
  const submit = vi.fn();
  const dirty = vi.fn();
  render(<Editor submit={submit} dirty={dirty} />);
  const input = screen.getByLabelText(copy.newLabel);
  await user.type(input, ' Unser   Urlaub {Enter}');
  expect(submit).not.toHaveBeenCalled();
  expect(dirty).toHaveBeenCalledWith(true);
  expect(dirty).toHaveBeenLastCalledWith(false);
  expect(screen.getByText('Unser Urlaub')).toBeDefined();
  await user.click(
    screen.getByRole('button', {
      name: copy.remove.replace('{{tag}}', 'Unser Urlaub'),
    }),
  );
  expect(screen.queryByText('Unser Urlaub')).toBeNull();
  expect(document.activeElement).toBe(input);
});

it('direct Save commits a valid pending label into submitted form data', async () => {
  const user = userEvent.setup();
  const submit = vi.fn();
  render(<Editor submit={submit} />);
  await user.type(screen.getByLabelText(copy.newLabel), 'Ostsee');
  await user.click(screen.getByText('Save moment'));
  expect(submit).toHaveBeenCalledWith(['Ostsee']);
});

it('duplicate and too-long drafts remain visible, invalid and unsaved until corrected', async () => {
  const user = userEvent.setup();
  const submit = vi.fn();
  render(<Editor initial={['home']} submit={submit} />);
  const input = screen.getByLabelText<HTMLInputElement>(copy.newLabel);
  await user.type(input, ' home {Enter}');
  expect(screen.getByRole('alert').textContent).toBe(copy.duplicate);
  expect(input.validity.valid).toBe(false);
  await user.click(screen.getByText('Save moment'));
  expect(submit).not.toHaveBeenCalled();
  await user.clear(input);
  await user.type(input, 'x'.repeat(41) + '{Enter}');
  expect(screen.getByRole('alert').textContent).toBe(
    copy.tooLong.replace('{{count}}', '40'),
  );
  await user.clear(input);
  await user.type(input, 'Café{Enter}');
  await user.click(screen.getByText('Save moment'));
  expect(submit).toHaveBeenCalledWith(['home', 'Café']);
});

it('accepts forty Unicode codepoints and caps the selected set without dropping existing labels', async () => {
  const user = userEvent.setup();
  render(
    <Editor initial={Array.from({ length: 7 }, (_, index) => `${index}`)} />,
  );
  await user.type(
    screen.getByLabelText(copy.newLabel),
    '🌅'.repeat(40) + '{Enter}',
  );
  expect(screen.getByText('🌅'.repeat(40))).toBeDefined();
  await user.type(screen.getByLabelText(copy.newLabel), 'Nine{Enter}');
  expect(screen.getByRole('alert').textContent).toBe(
    copy.tooMany.replace('{{count}}', '8'),
  );
  expect(screen.queryByText('Nine')).toBeNull();
});
