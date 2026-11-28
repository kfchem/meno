# ステップ

ワークフローに置けるステップの一つひとつについて、何を受け取り、何を渡すか、カードにどんなオプションがあるかを、Meno が並べるグループの順に説明します。ステップのつなぎ方、走らせ方、くり返し方は[ワークフロー](workflows)のページにあります。

## どこにあるか {#finding}

何もないところをダブルクリックして「Calculations」を選びます。まず Meno の行があり、ステップを持つプラグインを加えていれば、その後にプラグインごとの行が並びます。どの行にも、いくつのステップがあるかが出ます。行を開くと、そのステップが並びます。最初は Meno の行が開いています。ステップは細い線で四つのグループに分かれ、順に、構造を作る・選ぶ・突き合わせるステップ、エネルギーとそこから求めるもの、経路と測定、チャートと画像です。このページも同じ順に並べています。

- Meno の行は、はじめからあります。プログラムを走らせるステップは、それを走らせるプラグインの行にあります（[プラグイン](plugins#adding)）。
- ワイヤーを何もないところで離すと、そのワイヤーが運ぶものを受け取れるステップだけが並びます（[ワークフロー](workflows#adding)）。
- オプションにまだ値が要るステップは、置いたときにカードが開きます。それ以外のステップは、カードをクリックするとオプションが開きます。いちばん上の「Calculation」で、同じ行にある別のステップに変えられます。設定するもののないステップには「No options」と出ます。
- カードには、何もつながっていない間は「No input」、つながると「Ready」と出ます。走らせる前にまだ何かが要るときは、「Ready」の代わりに、何が要るかがカードに出ます。たとえば「Give the window, in kcal/mol」や「Name the property to rank by」です。
- たいていのステップには、外したものを渡す二つ目の出口があります（「The rest」「Alike」「Failed」など）。そこに出るものには一つずつ理由が書かれ、黙って捨てられるものはありません（[ワークフロー](workflows#results)）。

二つの入力のエントリーを突き合わせたり、エントリーをグループに分けたりするステップがいくつかあり、エントリーが持つプロパティで行います。そのためのプロパティは「Tag」ステップで付けられ、そのエントリーから作られるすべてのエントリーに引き継がれます。

## 構造を作る・選ぶ・突き合わせる {#structures}

### 先へ渡すものを選ぶ {#choosing}

- 「Duplicates」は、3D 分子、配座のセット、描いた構造を受け取ります。同じものは一つだけ残し、残りを「Alike」から出します。3D 分子では、水素も含めたすべての原子が互いに 0.01 Å 以内に重なるとき同じとみなします。重ねるのは回転と平行移動だけなので、配座とその鏡像は別のものです。どのエントリーにもエネルギーがあれば、同じもののうちいちばん低いものが残ります。電荷やスピンの違うエントリーは、同じとはみなしません。オプションは「Mirror images」（「Kept apart」または「Counted in (degeneracy 2)」）と「Compared within」（「Each compound」、または「Each value of a property」で「The property」を指定）です。描いた構造では、原子、結合、電荷、描かれた立体配置が同じなら、描いた向きにかかわらず同じとみなします。最初のものが残り、ほかのものには残ったものと「Same as」と書かれます。
- 「Filter」は、プロパティが「Conditions」を満たすエントリーを残します。条件は一行に一つずつか、セミコロンで区切って書きます。プロパティ、比較（< ≤ > ≥ = ≠、または <= >= != と入力）、値の順で、値に単位があれば単位も付けます（`energy ≤ -76.4 Eh` など）。値の代わりに、`its` に続けて同じエントリーの別のプロパティの名前を書くこともできます。「Kept where」は「All are met」か「Any is met」です。残らなかったものは「The rest」から出て、どの条件を満たさなかったかが書かれます。値は、同じ種類の単位どうしで換算してから比べます。
- 「Rank」は、「By」の値（指定しなければ energy）で、「Lowest first」か「Highest first」に並べ、「Keep the first」の数だけ残します。「Within」は「Each group」（配座のセットでは化合物ごと）、「Each value of a property」、「All together」のどれかです。残らなかったものは「The rest」から出て、何番目だったかが書かれます。求め方の違う値どうしは並べません。失敗したエントリーや収束しなかったエントリーも並べません。
- 「Choose one」は、配座のセットを受け取り、化合物ごとに配座を一つ渡します。「Lowest in energy」か、「By its number」（「Its number」で番号を指定）です。ほかの配座は「The rest」から出ます。

### フレームと配座 {#frames}

- 「Take frames」は、フレームを持つ分子（見つかった経路、最適化でたどった道すじ、スキャン）を受け取り、指定したフレームを一つずつ分子として渡します。「Take」は「The highest in energy」「The first」「The last」「Its entry frame」「The highest, and either side」のどれかで、最後のものは「Either side」で両側にいくつ取るかを決めます。「Keep from its molecule」には、各フレームが元の分子から受け継ぐプロパティを一行に一つずつ書きます。空のままなら、各フレームは自分のものだけを持ちます。
- 「As conformers」は一覧にはありません。3D 分子のセットから出したワイヤーを何もないところで離すと出てきます。構成、電荷、スピン、立体異性体が同じエントリーを、一つの配座のセットにまとめます。エネルギーが一つの計算から来ているときに限ります。そうでなければ、作らずに理由を言います。

### 描いた構造 {#drawn}

ここのステップは、3D 分子ではなく、描いた構造を受け取ります。「Check structures」と「Stereoisomers」には、3D 構造と同じく、化学のプラグインが要ります（[3D 構造](3d#making)）。

- 「Check structures」は構造を変えません。描いたまま「Checked」から出すか、理由を書いて「Set aside」から出すかです。調べることの一つひとつがオプションで、「Set aside」か「Keep」を選びます。「More than one part (a salt, a mixture)」、「An atom with more bonds than it can have」（こちらは「Keep as drawn」）、「A part with no electrons (H+)」、「Radicals」です。
- 「Stereoisomers」は、立体中心や二重結合の立体を決めずに残した構造を、3D に作れる立体異性体すべてにして、それぞれ描いた構造として渡します。決めずに残したところのない構造は、描いたまま渡します。「Stereo left open」は「Every stereoisomer」か「Set aside」です。立体異性体が「At most」より多い構造は、一部ではなく丸ごと外します。「Time for one」（秒）より長くかかる構造も外します。軸を決めずに残したアレンも外します。
- 「Enumerate」は、「Template」につないだ一つの図から構造を作ります。「By」は「R groups」か「Substituents」です。「R groups」では、図に R1、R2 などを描いておき、「R groups」の欄にそれぞれの R と置換基を `R1: Me, Et` のように書きます。すべての組み合わせが作られます。「Substituents」では、「Choose on the drawing」で「Positions」の原子を選び（「Done」で終わります）、「Groups, one to a line」に置換基を並べ、「Combine」で「One at a time」か「Together」を選びます。作れなかったものは、理由を書いて「Aside」から出ます。

### ラベル、電荷、複合体 {#labels}

- 「Tag」は、入力した「Name」のもとで、エントリーごとに固有の ID を付けます。この ID は後のすべてのステップでエントリーについていくので、後のステップで二つの入力をこれで突き合わせられます。
- 「Species」は、エントリーごとに「Charge」と「Multiplicity (blank: each entry's own)」を設定します。電荷だけを指定すると、多重度はその電荷で電子がとるものになります。前の電荷やスピンで求めたエネルギーは外され、そのことが行に出ます。電子数と合わない電荷と多重度や、水素のないエントリーは「Failed」から出ます。
- 「Combine」は、セットのエントリーをセットの順に一つのエントリー、つまり複合体にします。各部分は置かれた場所から動きません。電荷は足し合わされます。開殻の部分が二つ以上あると、それらを高スピンでまとめ、そう言います。ほかのスピン状態にするなら「Species」で設定します。

### 二つの入力 {#two-inputs}

ここのステップは、カードに名前の出る二つの入力を受け取り、両方がつながるまで走りません。

- 「Merge」は、「First」と「Second」を一つのセットにします。First のエントリーが先、Second のエントリーが後です。「Keep」は「All」か、「Of each」に書いたプロパティの値ごとに一つ残す「One of each」です。残らなかったものは「The rest」から出ます。
- 「Pass the side with fewer」は、First のセットを「First's」から、Second のセットを「Second's」から、それぞれ丸ごと渡すか、まったく渡さないかです。「Pass」は「The side with fewer, or both where alike」「Both」「First only」「Second only」のどれかです。任せたときは、化合物あたりのエントリー数が両者の和の 4 分の 1 以内なら両方を、そうでなければ少ないほうだけを渡します。
- 「Re-bond」は、「Geometry」のエントリーに、「Bonding」のエントリーの結合と電荷を与えます。原子の位置は変わりません。たとえば、反応物の配座に生成物の結合を与えます。二つは同じ原子を同じ番号付けで持っていなければなりません（先に「Atom map」を使います）。「Pairs」は「Each with each」か、「Property」で突き合わせる「Matched on」です。結合を付け替えられなかったものは「Not re-bonded」から出ます。
- 「Join」は、「From」のエントリーのプロパティを「Onto」のエントリーに載せます。「Matched on」に書いたプロパティの値が同じ、ただ一つの From のエントリーと組にします。載せるものは「Put on」に、一行に一つずつか、セミコロンで区切って書きます。`species as first end` と書くと、別の名前で載せます。相手のないエントリーや、相手が二つ以上あるエントリーは「Not joined」から出ます。
- 「Atom map」は、「Molecules」の各エントリーを「Reference」に原子ごとに、水素まで対応づけ、参照と同じ番号に付け直します。反応の生成物を反応物に、配座をその化学種に、といった使い方です。どちらも、水素をすべて持つ 3D 分子でなければなりません。「Molecules」と「Reference」はそれぞれ「Each its own」か「One side together」（たとえば二つの反応物を一つの側として）で、「Bonds」は「May change (a reaction)」か「Stay the same (conformers)」です。この三つには既定値がなく、選ぶまでカードが求めます。「Against」は「The one reference」「In order」、または「Property」で突き合わせる「Matched on」で、「Maps」は「First map」か「Every map」です。全電荷が同じ参照にだけ対応づけます。番号を付け直したエントリーは「Mapped」から、対応づけられなかったものは「Not mapped」から、生じた・切れた・変わった結合の表は「Bond changes」から出ます。

### 拘束 {#restraints}

「Restraints」と「Torsion restraints」が渡すのは分子ではなく、拘束一つにつき一行の表です。この表を、拘束を保つステップの「Restraints」入力につなぎます。どの行も、「Tag」が書いた ID でどの分子のものかを示します。その ID の名前を「Each row for the molecule by its」に書きます。

- 「Restraints」は、配位結合を二つの原子のファンデルワールス半径の和に係数を掛けた距離に保ち（「Coordination bonds」、係数は「Kept at」）、原子の組をいまの距離に保ち（「Pairs kept at their distance, atoms from 1 (3-7, 1-12)」）、原子をいまの場所に固定します（「Atoms fixed, from 1 (1, 4-6)」）。係数を入力するまで、カードには「Set the factor」と出ます。距離をどれだけ強く保つかは「Strength of each distance, kcal/mol/Å²」で決めます。
- 「Torsion restraints」は、ねじれ角を保ちます。「Torsions」は「Typed」か「From the reference」です。「Typed」では、「Four atoms to a line, from 1 (1-2-3-4)」に一行に四原子ずつ書き、「Held at, °」の角度に保ちます。「From the reference」では、「Reference」入力につないだ参照と違うねじれ角ごとに、「Held at」で「180° where trans」か「The reference's own angle」に保ちます。「Against」は「The one reference」か、「Property」で突き合わせる「Matched on」です。「Each held」は「By a strength」（「Strength, kcal/mol/rad²」）か「Exactly」です。三つの原子が一直線に並ぶねじれ角は受け付けません。
- 「Compare torsions」は、エントリーごとに、参照の二重結合をまたぐねじれ角のうち、参照ではトランスでエントリーではシスのものを数え、その数とどれかをエントリーに書きます。後に置いた「Filter」で分けるためです。どちら向きにも 90° を超えるものをトランスとします。「Against」は「The one reference」か、「Property」で突き合わせる「Matched on」です。すべてのエントリーが先へ進みます。比べられなかったものは「Failed」から出ます。

### 振動に沿って動かす {#displace}

「Displace」は、各構造を振動に沿って動かします。いちばん大きく動く原子が、「Amplitude (negative: against the mode as written)」（Å）だけ動きます。「Along」は「The imaginary vibration」か「A vibration by number」（「Vibration, from 1」）です。振幅を入力するまで、カードには「Give the amplitude」と出ます。その振動のないものは「Not displaced」から出ます。

「Repeat」は、Meno の行のこのグループの最後にあり、何もないところからだけ置けます。中のステップを一巡ずつくり返し走らせる枠を置きます（[ワークフロー](workflows)）。

## エネルギー {#energies}

- 「Energy window」は、エネルギーを持つ配座のセットか、分子を受け取り、いちばん低いものから「Within」kcal/mol 以内のものを残します。残らなかったものは「Outside it」から出ます。欄は値を入れるまで空で、その下に目安が出ます。「From the lowest in」は「Each compound」か、「Each value of a property」（「The property」、たとえば経路や生成物）です。
- 「Populations」は、配座のセットの各配座に、化合物の中でのボルツマン分布の割合を、「At」の温度（K）で付けます。
- 「3D results onto structures」は、3D で求めたものを、元になった描いた構造に戻します。描いた構造を「Structures」に、配座のセットを「3D results」につなぎます。各構造には、セットの中の配座の数、いちばん低いエネルギー、「Shares at」の温度での同じ分子式の構造の中での割合が付きます。外される構造はありません。
- 「Barrier」は、各鞍点に、出発点からの高さを kcal/mol で書きます。「Saddle points」と「Starts」をつなぎます。「Of」は「Free energy G」か「Electronic energy E」で、「G is」には G を持つプロパティの名前を書きます。「Rotational symmetry」は「As each program read it」か「Left out (σ = 1 on both sides)」です。「Pairs」は「In order」「Each with each」、または「Property」で突き合わせる「Matched on」です。鞍点は虚振動を一つだけ持つ収束したもの、出発点は収束した最適化の結果でなければならず、そうでなければ鞍点は理由を書いて「Failed」から出ます。
- 「Number」は何も受け取らず、数を一つ渡します。「Number」は「Standard state, 1 atm to 1 mol/L」（「At」の温度での、その変化の自由エネルギーの項）か、「Typed」（「Value」と「Unit」）です。
- 「Add」は、「Add」に書いた値（一行に一つずつか、セミコロンで区切る）と、「Number」入力につないだ数があればそれを足し、「As」の名前で書きます。たとえば、エネルギー、別のレベルで求めた G への補正、標準状態の項の和です。どの値も、そのエントリー自身の構造で求めたものでなければなりません。失敗したエントリーや収束しなかったエントリーは足さず、「Not added」から出します。
- 「Ensemble energy」は、グループの自由エネルギーを、メンバーそれぞれをボルツマン因子で重み付けし、縮重度の分だけ数えて、メンバーの値が示す温度で求め、グループでいちばん低いエントリーに書きます。「Of」は使う自由エネルギーの名前、「As」は書くときの名前です。「Within」は「Each group」「Each value of a property」「All together」のどれかです。ほかのメンバーは「The rest」から出ます。求め方や温度の違う値を持つメンバーがあると、そのグループは外されます。

## 経路と測定 {#paths}

- 「Measure」は、各エントリーに距離、角度、二面角を、`distance 3-7`、`angle 1-2-3`、`dihedral 1-2-3-4` のような名前のプロパティとして書きます。「Atoms」は「Typed」（「Atoms, from 1 (3-7, 1-2-3, 1-2-3-4)」）か、「From the table」です。「From the table」では、「Atom map」の「Bond changes」のような表を「Atoms」入力につなぎ、「Rows matched on (blank: every row)」を使います。距離は Å、角度は 0 から 180°、二面角は -180 から 180° です。
- 「Mode on atoms」は、振動を持つエントリーごとに、いちばん低い虚振動が、反応で変わる原子を何番目に動かすかを書きます。原子は、振動で動く大きさの順に並べます。エントリーはすべて残り、選ぶのは後に置く「Filter」です。「Atoms」は「From the table」（「Rows」は「Bonds formed or broken」か「Every row」、それに「Rows matched on (blank: every row)」）か、「Typed」（「Atoms, from 1 (1, 5, 11)」）です。「Reach: ranks past the atoms' count」には既定値がないので、0 以上の整数を入力します。
- 「Compare bonding」は、「Molecules」の各エントリーが「Reference」と同じように結合しているかを、構造から結合を読み取って調べます。同じものは「Same」から、違うものは違いを書いて「Different」から出ます。「Against」は、最初に一致した参照を「The match as」の名前でエントリーに書く「Each reference」（「Its value of (blank: its number)」も使います）か、「Property」で突き合わせる「Matched on」です。「R or S too」「E or Z too」「Every centre by number too」で、立体配置も比べます。「Pass over atoms, from 1」と「Pass over elements」で、金属などの原子を除けます。二つの原子は、共有結合半径の和に「Bonded within」を掛けた距離か、その和に「At least the sum plus, Å」を足した距離の、大きいほうより近ければ結合しているとみなします。比べるのはどの原子が結合しているかで、結合次数は比べません。

## チャート {#charts}

- 「Chart」は、表、分子、描いた構造を、どれも表として見て、チャートを描きます。「Across」と「Up」に列の名前を書きます。空のままなら、数の入った最初の二列を使います。
- 「Energy diagram」は、各レベルをそのいちばん低いエネルギーで、一つのレベルを基準に描きます。分子か配座のセットを「Levels」につなぎます。どのレベルがどれとつながるかを示す表を「Connects」につなぐこともできます。つながなければ、各レベルが次のレベルとつながります。「Energy」にはエネルギーの名前、「Levels, in order」にはレベル（「Rename one by writing = and the name after it」）、「Relative to」にはゼロにするレベルを書きます。「Levels by」と「Joined by」には、各エントリーのレベルと、それが何とつながるかを示すプロパティの名前を書きます。「Conformers」は「The lowest」か「Every one」です。

## プラグインが走らせるステップ {#plugins}

ここのステップはプログラムを走らせるもので、それを走らせるプラグインの行に、この名前で並びます。オプションはプラグインのもので、カードに出ます。たいていは、プログラムができなかったものを渡す「Failed」の出口を持ちます。ジョブの走り方や、見守り方、止め方は、ページ [計算とそのプログラム](calculations) にあります。

- 「Generate」は何も受け取らず、モデルが出したものから描いた構造を渡します。
- 「Conformers」は、描いた構造か 3D 分子を「Structures」で受け取り、配座のセットを渡します。プログラムが出す配座をすべて渡し、エネルギーの幅で外すことはしません。それは「Energy window」の仕事です。いくつ試すかを指定できる探索では、「Conformers sought」が「As many as the molecule needs」か「This many」（「How many」）になります。「As many as the molecule needs」では、新しい配座が「New conformers within」の範囲に出なくなるまで、何回かに分けて探します。この欄は値を入れるまで空で、その下に目安が出ます。
- 「Descriptors」は、描いた構造ごとに、分子量など構造から求めた数を付けます。
- 「Optimise」は各分子を最適化し、たどった道すじをフレームとして渡します。「Minimise with restraints」は、つないだ拘束を保ちながら、各分子を力場で最小化します。「Energy」は、各分子のその構造でのエネルギーを付けます。「Frequencies」は、振動と熱補正を付けます。
- 「Path search」は、同じ原子を同じ番号付けで持つ「Start」と「End」を受け取り、組ごとに分子を一つ渡します。そのフレームが経路で、エントリーは精密化した最も高い点です。「Pairs」は「In order」、「Each with each」（「At most, pairs」まで）、または「Property」で突き合わせる「Matched on」です。
- 「Optimise to a saddle point」は、「Guesses」の各構造を鞍点に向けて最適化します。「Reactant side」と「Product side」は、両方つなぐか、どちらもつながないかです。
- 「Follow the reaction path」は、鞍点など、与えた点から両方向へ下る経路をたどります。
- 「NCI」は、各分子に、非共有結合相互作用で色を付けた面を付けます。
- 「Render」は、各分子の画像を渡します（[画像と動画](pictures)）。

「Restraints」入力を持つステップは、そこにつないだ「Restraints」や「Torsion restraints」の表の行を保ちます。「Conformers」「Optimise」「Minimise with restraints」「Path search」「Optimise to a saddle point」です。
