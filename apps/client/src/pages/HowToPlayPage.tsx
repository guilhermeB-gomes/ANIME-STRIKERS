import { Link } from 'react-router-dom';
import { ANIMES, ATTRIBUTE_KEYS } from '@strikers/shared';

const STEPS = [
  ['1. Monte a sala', 'Crie uma sala privada (ou jogue contra bots), compartilhe o código e aguarde os treinadores. O anfitrião inicia a partida.'],
  ['2. Dispute no leilão', 'Cada treinador começa com 100 M (Strikers Coins). Os personagens são leiloados um a um: o primeiro lance é o valor inicial e cada novo lance sobe pelo menos 1 M. O cronômetro é de 15 s; um lance nos últimos 3 s soma 5 s. O maior lance vence e o valor é descontado do seu orçamento.'],
  ['3. Guarde moedas', 'Você precisa completar 5 titulares (goleiro, defesa, meio-campo, livre e ataque). O sistema reserva 1 M por vaga que ainda falta, então nunca fique sem condições de montar o time. Elenco máximo: 7 personagens.'],
  ['4. Monte a escalação', 'Escolha a formação e posicione seus personagens no campo. Fora de posição custa 15% de OVR. Personagens do mesmo universo (ou da mesma turma) geram sinergia de até +8%.'],
  ['5. Campeonato', 'Pontos corridos em turno único: vitória 3 pontos, empate 1, derrota 0. As partidas são simuladas no servidor com atributos, habilidades, formação e sinergia.'],
] as const;

export function HowToPlayPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 pt-4">
      <h1 className="font-display text-3xl font-black">Como jogar</h1>
      {STEPS.map(([title, text]) => (
        <section key={title} className="panel p-5">
          <h2 className="font-display text-lg font-black text-neon">{title}</h2>
          <p className="mt-1 text-mist">{text}</p>
        </section>
      ))}
      <section className="panel p-5">
        <h2 className="font-display text-lg font-black text-neon">Atributos e OVR</h2>
        <p className="mt-1 text-mist">Atributos vão de 1 a 100: {ATTRIBUTE_KEYS.join(', ')}. O OVR depende da posição: atacante usa finalização, velocidade, drible e controle; meio usa passe, controle, drible e visão; defensor usa defesa, físico e velocidade; goleiro usa reflexos, posicionamento e defesa.</p>
      </section>
      <section className="panel p-5">
        <h2 className="font-display text-lg font-black text-neon">Raridades e universos</h2>
        <p className="mt-1 text-mist">Comum, Raro, Épico, Lendário e Mítico mudam o visual da carta, mas não garantem sozinhos um OVR maior. Universos: {ANIMES.map((a) => a.name).join(', ')}.</p>
      </section>
      <div className="text-center">
        <Link to="/" className="btn btn-primary">
          Entendi, vamos jogar
        </Link>
      </div>
    </div>
  );
}
