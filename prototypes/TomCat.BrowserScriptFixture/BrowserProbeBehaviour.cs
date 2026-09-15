using TomCat;

namespace BrowserGame;

public sealed class BrowserProbeBehaviour : TomCatBehaviour
{
    [SerializeField]
    [Range(0.0f, 20.0f)]
    private float _speed = 6.0f;

    public static int Creates;
    public static int Updates;
    public static int Destroys;

    public float Speed => _speed;

    protected override void OnCreate() => Creates++;
    protected override void OnUpdate(float deltaTime) => Updates++;
    protected override void OnDestroy() => Destroys++;
}
