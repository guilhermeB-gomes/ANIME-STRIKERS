import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="space-y-4 pt-16 text-center">
      <h1 className="font-display text-4xl font-black">Página não encontrada</h1>
      <p className="text-mist">O endereço que você abriu não existe.</p>
      <Link to="/" className="btn btn-primary">
        Voltar ao início
      </Link>
    </div>
  );
}
