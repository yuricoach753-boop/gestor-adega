import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ExigeEmpresa, ExigeLogin, ExigeSuperAdmin, SomenteDeslogado, SomenteDono } from '@/components/Guards'
import AppLayout from '@/components/layout/AppLayout'
import Entrar from '@/pages/auth/Entrar'
import Cadastrar from '@/pages/auth/Cadastrar'
import EsqueciSenha from '@/pages/auth/EsqueciSenha'
import NovaSenha from '@/pages/auth/NovaSenha'
import CriarEmpresa from '@/pages/CriarEmpresa'
import Convite from '@/pages/Convite'
import Inicio from '@/pages/Inicio'
import Relatorios from '@/pages/relatorios/Relatorios'
import Assinatura from '@/pages/configuracoes/Assinatura'
import AdminLayout from '@/pages/admin/AdminLayout'
import AdminEmpresas from '@/pages/admin/AdminEmpresas'
import AdminNovaEmpresa from '@/pages/admin/AdminNovaEmpresa'
import AdminEmpresaDetalhe from '@/pages/admin/AdminEmpresaDetalhe'
import AdminPlanos from '@/pages/admin/AdminPlanos'
import AdminConfig from '@/pages/admin/AdminConfig'
import Mais from '@/pages/Mais'
import NaoEncontrada from '@/pages/NaoEncontrada'
import Configuracoes from '@/pages/configuracoes/Configuracoes'
import DadosEmpresa from '@/pages/configuracoes/DadosEmpresa'
import Usuarios from '@/pages/configuracoes/Usuarios'
import MeuPerfil from '@/pages/configuracoes/MeuPerfil'
import Produtos from '@/pages/produtos/Produtos'
import ProdutoForm from '@/pages/produtos/ProdutoForm'
import ProdutoDetalhe from '@/pages/produtos/ProdutoDetalhe'
import Movimentacoes from '@/pages/produtos/Movimentacoes'
import Estoque from '@/pages/produtos/Estoque'
import ImportarProdutos from '@/pages/produtos/ImportarProdutos'
import Compras from '@/pages/compras/Compras'
import NovaCompra from '@/pages/compras/NovaCompra'
import CompraDetalhe from '@/pages/compras/CompraDetalhe'
import Clientes from '@/pages/clientes/Clientes'
import ClienteDetalhe from '@/pages/clientes/ClienteDetalhe'
import Fornecedores from '@/pages/fornecedores/Fornecedores'
import FornecedorDetalhe from '@/pages/fornecedores/FornecedorDetalhe'
import PessoaEditar from '@/pages/pessoas/PessoaEditar'
import Vendas from '@/pages/vendas/Vendas'
import NovaVenda from '@/pages/vendas/NovaVenda'
import ConsultaPreco from '@/pages/vendas/ConsultaPreco'
import VendaDetalhe from '@/pages/vendas/VendaDetalhe'
import Receber from '@/pages/financeiro/Receber'
import NovaContaReceber from '@/pages/financeiro/NovaContaReceber'
import ContaReceberDetalhe from '@/pages/financeiro/ContaReceberDetalhe'
import Pagar from '@/pages/financeiro/Pagar'
import ContaPagarForm from '@/pages/financeiro/ContaPagarForm'
import ContaPagarDetalhe from '@/pages/financeiro/ContaPagarDetalhe'
import ContasFixas from '@/pages/financeiro/ContasFixas'
import TurnosCaixa from '@/pages/financeiro/TurnosCaixa'
import Caixa from '@/pages/financeiro/Caixa'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Públicas */}
        <Route element={<SomenteDeslogado />}>
          <Route path="/entrar" element={<Entrar />} />
          <Route path="/cadastrar" element={<Cadastrar />} />
          <Route path="/esqueci-senha" element={<EsqueciSenha />} />
        </Route>
        <Route path="/nova-senha" element={<NovaSenha />} />
        <Route path="/convite/:token" element={<Convite />} />

        {/* Logado */}
        <Route element={<ExigeLogin />}>
          <Route path="/criar-empresa" element={<CriarEmpresa />} />

          {/* Administrador do sistema */}
          <Route element={<ExigeSuperAdmin />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminEmpresas />} />
              <Route path="empresas/nova" element={<AdminNovaEmpresa />} />
              <Route path="empresas/:id" element={<AdminEmpresaDetalhe />} />
              <Route path="planos" element={<AdminPlanos />} />
              <Route path="config" element={<AdminConfig />} />
            </Route>
          </Route>

          {/* Logado + empresa liberada */}
          <Route element={<ExigeEmpresa />}>
            <Route element={<AppLayout />}>
              <Route index element={<Inicio />} />
              <Route path="vendas" element={<Vendas />} />
              <Route path="vendas/nova" element={<NovaVenda />} />
              <Route path="consulta-preco" element={<ConsultaPreco />} />
              <Route path="vendas/:id" element={<VendaDetalhe />} />
              <Route path="produtos" element={<Produtos />} />
              <Route path="produtos/novo" element={<ProdutoForm />} />
              <Route path="produtos/importar" element={<ImportarProdutos />} />
              <Route path="produtos/movimentacoes" element={<Movimentacoes />} />
              <Route path="estoque" element={<Estoque />} />
              <Route path="produtos/:id" element={<ProdutoDetalhe />} />
              <Route path="produtos/:id/editar" element={<ProdutoForm />} />
              <Route path="compras" element={<Compras />} />
              <Route path="compras/nova" element={<NovaCompra />} />
              <Route path="compras/:id" element={<CompraDetalhe />} />
              <Route path="clientes" element={<SomenteDono><Clientes /></SomenteDono>} />
              <Route path="clientes/novo" element={<SomenteDono><PessoaEditar tipo="cliente" /></SomenteDono>} />
              <Route path="clientes/:id" element={<SomenteDono><ClienteDetalhe /></SomenteDono>} />
              <Route path="clientes/:id/editar" element={<SomenteDono><PessoaEditar tipo="cliente" /></SomenteDono>} />
              <Route path="fornecedores" element={<SomenteDono><Fornecedores /></SomenteDono>} />
              <Route path="fornecedores/novo" element={<SomenteDono><PessoaEditar tipo="fornecedor" /></SomenteDono>} />
              <Route path="fornecedores/:id" element={<SomenteDono><FornecedorDetalhe /></SomenteDono>} />
              <Route path="fornecedores/:id/editar" element={<SomenteDono><PessoaEditar tipo="fornecedor" /></SomenteDono>} />
              <Route path="financeiro" element={<Navigate to="/financeiro/receber" replace />} />
              <Route path="financeiro/receber" element={<Receber />} />
              <Route path="financeiro/receber/nova" element={<NovaContaReceber />} />
              <Route path="financeiro/receber/:id" element={<ContaReceberDetalhe />} />
              <Route path="financeiro/pagar" element={<Pagar />} />
              <Route path="financeiro/pagar/nova" element={<ContaPagarForm />} />
              <Route path="financeiro/pagar/fixas" element={<ContasFixas />} />
              <Route path="financeiro/pagar/:id" element={<ContaPagarDetalhe />} />
              <Route path="financeiro/pagar/:id/editar" element={<ContaPagarForm />} />
              <Route path="financeiro/caixa" element={<Caixa />} />
              <Route path="financeiro/caixa/turnos" element={<TurnosCaixa />} />
              <Route path="relatorios" element={<Relatorios />} />
              <Route path="mais" element={<Mais />} />
              <Route path="configuracoes" element={<SomenteDono><Configuracoes /></SomenteDono>} />
              <Route path="configuracoes/empresa" element={<DadosEmpresa />} />
              <Route path="configuracoes/usuarios" element={<Usuarios />} />
              <Route path="configuracoes/perfil" element={<MeuPerfil />} />
              <Route path="configuracoes/assinatura" element={<Assinatura />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NaoEncontrada />} />
      </Routes>
    </BrowserRouter>
  )
}
