import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const login = vi.fn<(name: string) => Promise<boolean>>();
vi.mock('../src/socket/GameProvider', () => ({ useGame: () => ({ login }) }));

import { NameForm } from '../src/components/NameForm';

describe('NameForm', () => {
  beforeEach(() => {
    login.mockReset();
    window.localStorage.clear();
  });

  it('só habilita o botão com 2+ caracteres e envia o nome sem espaços nas pontas', async () => {
    login.mockResolvedValue(true);
    const onDone = vi.fn();
    render(<NameForm onDone={onDone} />);
    const button = screen.getByRole('button', { name: 'Entrar como convidado' });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Como devemos te chamar?'), '  Ana ');
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(login).toHaveBeenCalledWith('Ana');
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('não chama onDone quando o servidor recusa', async () => {
    login.mockResolvedValue(false);
    const onDone = vi.fn();
    render(<NameForm onDone={onDone} />);
    await userEvent.type(screen.getByLabelText('Como devemos te chamar?'), 'Bo');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar como convidado' }));
    expect(login).toHaveBeenCalledWith('Bo');
    expect(onDone).not.toHaveBeenCalled();
  });
});
